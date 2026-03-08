from flask import Flask, request, jsonify, render_template

import numpy as np

from scipy import stats



app = Flask(__name__)



@app.route('/')

def index():

    return render_template('index.html')



@app.route('/api/calculate', methods=['POST'])

def calculate():

    try:

        data = request.json

        time = np.array(data.get('time', []), dtype=float)

        

        comp_count = int(data.get('comp_count', 1))

        conc_dict = data.get('conc', {})

        

        if comp_count == 1:

            # Fallback for old/simple format

            if isinstance(conc_dict, list):

                conc = np.array(conc_dict, dtype=float)

            else:

                conc = np.array(conc_dict.get('1', []), dtype=float)

        else:

            # Sum all compartments to get total plasma concentration for underlying PK algorithm

            # Note: For multi-compartment dosing, observing discrete compartments usually means 

            # C_total = C_central ( compartment 1 ) + C_peripheral (2, 3...)

            # We will use Central compartment (1) as the baseline for calculating PK parameters

            # while keeping independent data for charting

            conc = np.array(conc_dict.get('1', []), dtype=float)

            

        dose = float(data.get('dose', 0))

        route = data.get('admin_route', 'IV Bolus')



        if len(time) != len(conc) or len(time) < 3:

            return jsonify({'error': 'Invalid data length. Need at least 3 points.'}), 400

        

        if dose <= 0:

            return jsonify({'error': 'Dose must be greater than 0.'}), 400



        # Filter out zero or negative concentrations for log calculations

        valid_idx = conc > 0

        time_valid = time[valid_idx]

        conc_valid = conc[valid_idx]

        log_conc = np.log(conc_valid)



        if len(time_valid) < 3:

            return jsonify({'error': 'Not enough valid concentration points (>0) for log regression.'}), 400



        # Linear Regression for Zero Order (C vs t)

        slope_zero, intercept_zero, r_val_zero, p_val_zero, std_err_zero = stats.linregress(time, conc)

        r_squared_zero = r_val_zero**2



        # Linear Regression for First Order (ln(C) vs t)

        term_idx = -min(len(time_valid), max(3, len(time_valid)//2)) # basic heuristic for terminal phase

        

        slope_first, intercept_first, r_val_first, p_val_first, std_err_first = stats.linregress(time_valid[term_idx:], log_conc[term_idx:])

        

        # Overall first order fit for comparison

        slope_overall, intercept_overall, r_val_overall, _, _ = stats.linregress(time_valid, log_conc)

        r_sq_overall = r_val_overall**2



        # Linear Regression for Second Order (1/C vs t)

        inverse_conc = 1 / conc_valid

        slope_second, intercept_second, r_val_second, _, _ = stats.linregress(time_valid, inverse_conc)

        r_sq_second = r_val_second**2



        # Linear Regression for Third Order (1/C^2 vs t)

        inverse_sq_conc = 1 / (conc_valid**2)

        slope_third, intercept_third, r_val_third, _, _ = stats.linregress(time_valid, inverse_sq_conc)

        r_sq_third = r_val_third**2



        # Determine likely order based on highest R^2

        r2_values = {

            "Zero Order": r_squared_zero,

            "First Order": r_sq_overall,

            "Second Order": r_sq_second,

            "Third Order": r_sq_third

        }

        likely_order = max(r2_values, key=r2_values.get)



        # Compartment Modeling (1-Comp vs 2-Comp)
        # Only fit bi-exponential on central compartment if implicitly 1 was selected.
        # If user explicitly chose 2+ compartments, we bypass inference since they define the compartments.

        from scipy.optimize import curve_fit



        def bi_exponential(t, A, alpha, B, beta):

            return A * np.exp(-alpha * t) + B * np.exp(-beta * t)



        comp2_params = {}

        target_model = "1-Compartment"

        aic_1comp = float('inf')

        aic_2comp = float('inf')

        b_exp_fit = []



        if comp_count == 1:
            try:
                # Fit 1-Compartment (Mono-exponential: C = C0 * e^-Ke*t)

                # Already have C0 (intercept_overall) and Ke (-slope_overall)

                c_pred_1comp = np.exp(intercept_overall) * np.exp(slope_overall * time_valid)

                rss_1comp = np.sum((conc_valid - c_pred_1comp)**2)

                n = len(time_valid)

                # AIC = n * ln(RSS/n) + 2k, k=2 for 1-comp (C0, Ke)

                if rss_1comp > 0 and n > 2:

                    aic_1comp = n * np.log(rss_1comp / n) + 2 * 2

                

                # Initial guess for 2-comp: B, beta from terminal phase; A, alpha from residuals

                beta_guess = -slope_first if slope_first < 0 else 0.1

                B_guess = np.exp(intercept_first)

                

                res_conc = conc_valid - (B_guess * np.exp(-beta_guess * time_valid))

                valid_res_idx = res_conc > 0

                if np.sum(valid_res_idx) >= 2:

                    slope_res, int_res, _, _, _ = stats.linregress(time_valid[valid_res_idx], np.log(res_conc[valid_res_idx]))

                    alpha_guess = -slope_res if slope_res < 0 else beta_guess * 5

                    A_guess = np.exp(int_res)

                else:

                    alpha_guess = beta_guess * 10

                    A_guess = B_guess * 2



                p0 = [A_guess, alpha_guess, B_guess, beta_guess]

                

                # Bounds to keep parameters positive

                bounds = ([0, 0, 0, 0], [np.inf, np.inf, np.inf, np.inf])

                

                popt, _ = curve_fit(bi_exponential, time_valid, conc_valid, p0=p0, bounds=bounds, maxfev=5000)

                A_fit, alpha_fit, B_fit, beta_fit = popt

                

                c_pred_2comp = bi_exponential(time_valid, A_fit, alpha_fit, B_fit, beta_fit)

                rss_2comp = np.sum((conc_valid - c_pred_2comp)**2)

                
                # AIC, k=4 for 2-comp

                if rss_2comp > 0 and n > 4:

                    aic_2comp = n * np.log(rss_2comp / n) + 2 * 4



                # Ensure alpha > beta (convention)

                if beta_fit > alpha_fit:

                    A_fit, B_fit = B_fit, A_fit

                    alpha_fit, beta_fit = beta_fit, alpha_fit



                comp2_params = {

                    'A': float(A_fit),

                    'alpha': float(alpha_fit),

                    'B': float(B_fit),

                    'beta': float(beta_fit),

                    'k21': float((A_fit * beta_fit + B_fit * alpha_fit) / (A_fit + B_fit)),

                    'k10': float((alpha_fit * beta_fit) / ((A_fit * beta_fit + B_fit * alpha_fit) / (A_fit + B_fit)))

                }

                comp2_params['k12'] = float(alpha_fit + beta_fit - comp2_params['k21'] - comp2_params['k10'])

                

                b_exp_fit = bi_exponential(time, *popt).tolist()



                # For model selection, typically difference of 2 in AIC is significant

                if aic_2comp < aic_1comp - 2 and r_sq_overall > 0.8: # Prevent 2-comp overfitting on garbage data

                    target_model = "2-Compartment"



            except Exception as e:

                # Fallback to 1-comp if curve fit fails

                print(f"Curve fit failed: {e}")

                pass
        else:
            target_model = f"{comp_count}-Compartments Explicit"



        # PK Parameters (assuming First Order 1-compartment IV bolus for primary outputs)

        ke = -slope_first if slope_first < 0 else 0.0001 # Avoid negative Ke

        half_life = np.log(2) / ke if ke > 0 else 0



        # Extrapolate C0

        c0 = np.exp(intercept_first)

        if target_model == "2-Compartment" and 'A' in comp2_params and 'B' in comp2_params:

            c0 = comp2_params['A'] + comp2_params['B']



        # Volume of Distribution

        vd = dose / c0 if c0 > 0 else 0



        # Clearance

        cl = ke * vd



        # Oral Model Calculations

        oral_params = None

        target_model_final = target_model

        if route == 'Oral':

            if comp_count > 1:

                target_model_final = f"{comp_count}-Compartments Explicit (Oral)"

            else:

                target_model_final = "1-Compartment Oral"

            # Cmax and Tmax from observed data

            max_idx = np.argmax(conc)

            cmax_obs = float(conc[max_idx])

            tmax_obs = float(time[max_idx])

            

            # Estimate Ka (Absorption Rate Constant)

            # Using Method of Residuals

            ka = ke * 2 # Fallback

            c_extrap_elim = np.exp(intercept_first) * np.exp(-ke * time_valid[:max_idx+1])

            residuals = c_extrap_elim - conc_valid[:max_idx+1]

            

            valid_res_idx = residuals > 0

            if np.sum(valid_res_idx) >= 2:

                res_time = time_valid[:max_idx+1][valid_res_idx]

                res_log = np.log(residuals[valid_res_idx])

                slope_ka, int_ka, _, _, _ = stats.linregress(res_time, res_log)

                if slope_ka < 0:

                    ka = -slope_ka

            

            # Recalculate Apparent Vd/F and Cl/F using Extrapolated Y-intercept (A)

            # C(t) = A(e^-ke*t - e^-ka*t), where A = (F*D*Ka)/(Vd*(Ka-Ke))

            vd_f = (dose * ka) / (np.exp(intercept_first) * (ka - ke)) if ka > ke else vd

            cl_f = ke * vd_f

            

            # Predict Tmax and Cmax

            tmax_pred = np.log(ka/ke) / (ka - ke) if ka != ke else tmax_obs

            

            oral_params = {

                'ka': float(ka),

                'tmax_obs': cmax_obs, # Will swap below

                'cmax_obs': cmax_obs,

                'tmax_pred': float(tmax_pred),

                'vd_f': float(vd_f),

                'cl_f': float(cl_f)

            }

            oral_params['tmax_obs'] = tmax_obs



        # AUC (Trapezoidal Rule)

        try:

            auc_last = np.trapezoid(conc, time)

        except AttributeError:

            auc_last = np.trapz(conc, time)



        # Extrapolate AUC from t=last to infinity

        if target_model_final == "2-Compartment" and 'A' in comp2_params:

            # Analytical AUC for 2-comp: A/alpha + B/beta

            auc_total = (comp2_params['A']/comp2_params['alpha']) + (comp2_params['B']/comp2_params['beta'])

        elif route == 'Oral' and oral_params:

            auc_inf_extrap = conc[-1] / ke if ke > 0 else 0

            auc_total = auc_last + auc_inf_extrap

            # Analytical: F*D/Cl = D/Cl_f

            auc_analytical = dose / oral_params['cl_f'] if oral_params['cl_f'] > 0 else auc_total

            oral_params['auc_analytical'] = float(auc_analytical)

        else:

            auc_inf_extrap = conc[-1] / ke if ke > 0 else 0

            auc_total = auc_last + auc_inf_extrap


        multi_data = {}
        for c in range(1, comp_count + 1):
            comp_vals = conc_dict.get(str(c), [])
            try:
                comp_vals_num = [float(x) for x in comp_vals]
                multi_data[f'C{c}'] = comp_vals_num
            except:
                pass

        response = {

            'order_analysis': {

                'zero_order_r2': float(r_squared_zero),

                'first_order_r2': float(r_sq_overall),

                

                'second_order_r2': float(r_sq_second),

                

                'third_order_r2': float(r_sq_third),



                'likely_order': likely_order

            },

            

            'compartment_analysis': {

                'route': route,

                'model': target_model_final,

                'aic_1comp': float(aic_1comp) if aic_1comp != float('inf') else None,

                'aic_2comp': float(aic_2comp) if aic_2comp != float('inf') else None,

                'parameters_2comp': comp2_params if comp2_params and route != 'Oral' else None,

                'oral_params': oral_params,
                
                'explicit_count': comp_count,
                
                'multi_data': multi_data

            },



            'parameters': {

                'ke': float(ke),

                'half_life': float(half_life),

                'c0': float(c0),

                'vd': float(vd) if route != 'Oral' else float(oral_params['vd_f']),

                'cl': float(cl) if route != 'Oral' else float(oral_params['cl_f']),

                'auc_last': float(auc_last),

                'auc_total': float(auc_total)

            },



            # Return regression lines for frontend plotting

            'fits': {

                'zero_order': (float(slope_zero) * time + float(intercept_zero)).tolist(),

                'first_order_log': (float(slope_overall) * time_valid + float(intercept_overall)).tolist(),

                

                'second_order_inv': (float(slope_second) * time_valid + float(intercept_second)).tolist(),

                

                'third_order_inv_sq': (float(slope_third) * time_valid + float(intercept_third)).tolist(),

                

                'bi_exponential': b_exp_fit if route != 'Oral' else []

            }

        }

        

        if route == 'Oral' and oral_params:

            A_oral = np.exp(intercept_first)

            ka = oral_params['ka']

            response['fits']['oral_model'] = (A_oral * (np.exp(-ke * time) - np.exp(-ka * time))).tolist()





        return jsonify(response)



    except Exception as e:

        return jsonify({'error': str(e)}), 500



if __name__ == '__main__':

    app.run(debug=True, port=5001)
