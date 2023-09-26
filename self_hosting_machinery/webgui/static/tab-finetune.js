let stop_streaming = false;
let fetchController = new AbortController();

let finetune_state,
    reference_finetune_state,
    finetune_configs_and_runs,
    reference_finetune_configs_and_runs;

let selected_lora,
    loras_switch_off,
    loras_switch_latest,
    loras_switch_specific,
    loras_switch_no_reaction;
let finetune_settings_defaults = [];

let finetune_filter_panel,
    finetune_filter_button,
    finetune_filter_settings,
    finetune_filter_status,
    finetune_filter_progress,
    finetune_filter_error;

let finetune_panel,
    finetune_button,
    finetune_settings;

let select_model_panel,
    use_model_panel;

let logstream_reader,
    logstream_runid;

function tab_finetune_get() {
    fetch("tab-finetune-get")
    .then(function (response) {
        return response.json();
    })
    .then(function (data) {
        console.log('tab-finetune-get',data);
        finetune_state = data;
    });
}

function tab_finetune_config_and_runs() {
    fetch("/tab-finetune-config-and-runs")
        .then(function (response) {
            return response.json();
        })
        .then(function (data) {
            console.log('tab-finetune-config-and-runs',data);
            finetune_configs_and_runs = data;
            render_runs();
            render_model_select();
            render_finetune_settings(data);
            render_lora_switch();
            finetune_controls_state();
        });
}

function render_model_select(force = false) {
    const model_selector = document.querySelector('#finetune-model');
    if (model_selector && model_selector.options.length > 0 && !force) {
        return;
    }
    fetch("/tab-host-models-get")
        .then(function(response) {
            return response.json();
        })
        .then(function(data) {
            console.log('tab-host-models-get',data);
            model_selector.innerHTML = '';
            data.models.forEach(model => {
                if(model.has_finetune) {
                    const new_option = new Option(model.name, model.name); 
                    if(finetune_configs_and_runs.config.model_name === model.name) {
                        new_option.selected = true;
                    }
                    model_selector.appendChild(new_option);
                }
            });
    });
}

function render_finetune_settings(data = {}) {
    if (data.config.auto_delete_n_runs) {
        document.querySelector('.store-input').value = data.config.auto_delete_n_runs;
    }
    if (data.config.limit_training_time_minutes) {
        const radio_limit_time = document.querySelector(`input[name="limit_training_time_minutes"][value="${data.config.limit_training_time_minutes}"]`);
        if (radio_limit_time) {
            radio_limit_time.checked = true;
        }
    }
    if (data.config.run_at_night) {
        document.querySelector('#night_run').checked = true;
    }
    if (data.config.run_at_night_time) {
        const selectElement = document.querySelector('.night-time');
        const optionToSelect = selectElement.querySelector(`option[value="${data.config.run_at_night_time}"]`);
        if (optionToSelect) {
            optionToSelect.selected = true;
        }
    }
}

function render_runs() {
    if(finetune_configs_and_runs.finetune_runs.length === 0) {
        return;
    }
    let finetune_is_working = false;
    const runs_table = document.querySelector('.run-table');

    if(finetune_configs_and_runs.finetune_runs.length > 0) {
        runs_table.innerHTML = '';
    }
    finetune_configs_and_runs.finetune_runs.forEach(run => {
        const run_table_row = document.createElement('tr');
        run_table_row.style.whiteSpace = 'nowrap';
        const run_name = document.createElement("td");
        const run_status = document.createElement("td");
        const run_minutes = document.createElement("td");
        const run_steps = document.createElement("td");
        const run_delete = document.createElement("td");

        run_name.innerText = run.run_id;

        let status_colors = {
            'unknown': 'text-bg-warning',
            'starting': 'text-bg-secondary',
            'working': 'text-bg-secondary',
            'completed': 'text-bg-success',
            'finished': 'text-bg-success',
            'failed': 'text-bg-danger'
        };
        
        let run_status_color = status_colors[run.status] || 'text-bg-info';
        run_table_row.dataset.run = run.run_id;

        const run_is_working = !(['interrupted', 'failed', 'finished'].includes(run.status));
        if (run_is_working) {
            if(!finetune_is_working) {
                run_status.innerHTML = `<span class="badge rounded-pill ${run_status_color}"><div class="finetune-spinner spinner-border spinner-border-sm" role="status"></div>${run.status}</span>`;
            }
            finetune_is_working = true;
            if (!selected_lora) {
                selected_lora = run.run_id;
            }
        } else {
            run_status.innerHTML = `<span class="badge rounded-pill ${run_status_color}">${run.status}</span>`;
        }
        if (run.status === 'working' && run.eta_minutes ) {
            run_minutes.innerHTML = run.eta_minutes;
        }
        run_steps.innerHTML = run.worked_steps;

        const item_disabled = run_is_working ? "disabled" : ""
        run_delete.innerHTML = `<button class="btn btn-danger btn-sm" ${item_disabled}><i class="bi bi-trash3-fill"></i></button>`;
        run_table_row.appendChild(run_name);
        run_table_row.appendChild(run_status);
        run_table_row.appendChild(run_minutes);
        run_table_row.appendChild(run_steps);
        run_table_row.appendChild(run_delete);

        if (!run_is_working) {
            run_delete.addEventListener('click', () => {
                const lora_for_delete = run_table_row.dataset.run;
                let delete_lora_modal = document.getElementById('delete-lora-modal');
                let delete_lora_modal_button = delete_lora_modal.querySelector('.delete-lora-modal-submit');
                delete_lora_modal_button.dataset.lora = lora_for_delete;
                let delete_lora_modal_instance = bootstrap.Modal.getOrCreateInstance(delete_lora_modal);
                delete_lora_modal_instance.show();
            });
        }

        runs_table.appendChild(run_table_row);
        if (selected_lora == run.run_id) {
            run_table_row.classList.add('table-success');
            const timestamp = new Date().getTime();
            const gfx = document.querySelector('.fine-gfx');
            gfx.src = `/tab-finetune-progress-svg/${run.run_id}?t=${timestamp}`;
            // TODO: FIX
            // start_log_stream(run.run_id);
            
            if(!stop_streaming) {
                startStream(run.run_id);
            }

            const log_link = document.querySelector('.log-link');
            if(log_link && log_link.classList.contains('d-none')) {
                log_link.classList.remove('d-none');
            }
            if(log_link) {
                log_link.href = `/tab-finetune-log/${run.run_id}`;
            }
        }
        // if(is_working) {
            //     start_finetune_button.innerHTML = '<div class="upload-spinner spinner-border spinner-border-sm" role="status"></div>' + 'Stop';
            // } else {
                //     start_finetune_button.innerHTML = '<i class="bi bi-gpu-card"></i> Run Now';
                // }
                // start_finetune_button.setAttribute("need_to_stop", is_working)
            });
    const runs_table_rows = runs_table.querySelectorAll('tr');
    runs_table_rows.forEach(function (row) {
        row.addEventListener('click', function (event) {
            event.stopPropagation();
            const run_id = this.dataset.run;
            selected_lora = run_id;
            render_checkpoints(find_checkpoints_by_run(run_id));
        });
    });
}

function delete_run(run_id) {
    fetch(`/tab-finetune-remove/${run_id}`)
    .then(response => {
        if (!response.ok) {
            return response.json()
        }
        const gfx = document.querySelector('.fine-gfx');
        gfx.src = `/tab-finetune-progress-svg/none`;
          const log_container = document.querySelector('.tab-upload-finetune-logs');
        if (log_container) {
            log_container.innerHTML = '';
        }
    })
    .then(error => {
        throw new Error(error.message);
    });
}

const find_checkpoints_by_run = (run_id) => {
    const finetune_run = finetune_configs_and_runs.finetune_runs.find((run) => run.run_id === run_id);
    if (finetune_run) {
      return finetune_run.checkpoints;
    } else {
      return null;
    }
};

function render_lora_switch() {
    let mode = finetune_configs_and_runs.active[finetune_configs_and_runs.config.model_name] ? finetune_configs_and_runs.active[finetune_configs_and_runs.config.model_name].lora_mode : "latest-best";
    loras_switch_no_reaction = true; // avoid infinite loop when setting .checked
    if (mode === 'off') {
        loras_switch_off.checked = true;
    } else if (mode === 'latest-best') {
        loras_switch_latest.checked = true;
    } else if (mode === 'specific') {
        loras_switch_specific.checked = true
    }
    loras_switch_no_reaction = false;
    let lora_switch_run_id = document.querySelector('#lora-switch-run-id');
    let lora_switch_checkpoint = document.querySelector('#lora-switch-checkpoint');
    if (mode === 'specific') {
        lora_switch_run_id.style.display = 'block';
        lora_switch_checkpoint.style.display = 'block';
        lora_switch_run_id.style.opacity = 1;
        lora_switch_checkpoint.style.opacity = 1;
        lora_switch_run_id.innerHTML = `<b>Run:</b> ${finetune_configs_and_runs.active[finetune_configs_and_runs.config.model_name].specific_lora_run_id}`;
        lora_switch_checkpoint.innerHTML = `<b>Checkpoint:</b> ${finetune_configs_and_runs.active[finetune_configs_and_runs.config.model_name].specific_checkpoint}`;
    } else if (mode == 'latest-best') {
        lora_switch_run_id.style.display = 'block';
        lora_switch_checkpoint.style.display = 'block';
        lora_switch_run_id.style.opacity = 0.5;
        lora_switch_checkpoint.style.opacity = 0.5;
        lora_switch_run_id.innerHTML = `<b>Run:</b> ${finetune_configs_and_runs.finetune_latest_best.latest_run_id}`;
        lora_switch_checkpoint.innerHTML = `<b>Checkpoint:</b> ${finetune_configs_and_runs.finetune_latest_best.best_checkpoint_id}`;
    } else {
        lora_switch_run_id.style.display = 'none';
        lora_switch_checkpoint.style.display = 'none';
        lora_switch_run_id.innerHTML = `<b>Run:</b> ${finetune_configs_and_runs.active[finetune_configs_and_runs.config.model_name].specific_lora_run_id}`;
        lora_switch_checkpoint.innerHTML = `<b>Checkpoint:</b> ${finetune_configs_and_runs.active[finetune_configs_and_runs.config.model_name].specific_checkpoint}`;
    }
}

function loras_switch_clicked() {
    if (loras_switch_no_reaction)
        return;
    if (loras_switch_off.checked === true) {
        finetune_switch_activate("off");
    } else if (loras_switch_latest.checked === true) {
        finetune_switch_activate("latest-best");
    } else if (loras_switch_specific.checked === true) {
        finetune_switch_activate("specific");
    }
}

function render_checkpoints(data = []) {
    const checkpoints = document.querySelector('.table-checkpoints');
    checkpoints.innerHTML = '';
    if (data.length > 0) {
        data.forEach(element => {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.textContent = `${element.checkpoint_name}`;
            cell.dataset.checkpoint = element.checkpoint_name;
            if(cell.dataset.checkpoint === finetune_configs_and_runs.active.specific_checkpoint) {
                row.classList.add('table-success');
            }
            row.appendChild(cell);
            checkpoints.appendChild(row);
            row.addEventListener('click', (event) => {
                if(!row.classList.contains('table-success')) {
                    let prev = document.querySelector('.table-checkpoints .table-success');
                    if (prev) {
                        prev.classList.remove('table-success');
                    }
                    row.classList.add('table-success');
                }
                finetune_switch_activate("specific", selected_lora, cell.dataset.checkpoint);
            });
        });
    }
}

function finetune_switch_activate(lora_mode, run_id, checkpoint) {
    let send_this = {
        "model": document.querySelector('#finetune-model').value,
        "lora_mode": lora_mode,
        "specific_lora_run_id": run_id ? run_id : finetune_configs_and_runs.active.specific_lora_run_id,
        "specific_checkpoint": checkpoint ? checkpoint : finetune_configs_and_runs.active.specific_checkpoint,
    }
    fetch("/tab-finetune-activate", {
        method: "POST",
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(send_this)
    })
    .then(function (response) {
        tab_finetune_get();
    });
}

function render_schedule_dialog() {
    const selectElement = document.querySelector('.night-time');
    for (let hour = 0; hour < 24; hour++) {
        const option = document.createElement("option");
        const formattedHour = hour.toString().padStart(2, "0");

        option.value = formattedHour + ":00";
        option.text = formattedHour + ":00";
        selectElement.appendChild(option);
    }
}

const finetune_inputs = document.querySelectorAll('.fine-tune-input');
for (let i = 0; i < finetune_inputs.length; i++) {
    finetune_inputs[i].addEventListener('change', function () {
        save_finetune_schedule();
    });
}
function save_finetune_schedule() {
    const data = {
        "limit_training_time_minutes": document.querySelector('input[name="limit_training_time_minutes"]:checked').value,
        "run_at_night": document.querySelector('#night_run').checked,
        "run_at_night_time": document.querySelector('.night-time').value,
        "auto_delete_n_runs": document.querySelector('.store-input').value,
    }
    console.log('save_finetune_settings', data);
    fetch("/tab-finetune-config-save", {
        method: "POST",
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    })
    .then(function (response) {
        console.log(response);
        tab_finetune_get();
    });
}

function get_finetune_settings(defaults = false) {
    fetch("/tab-finetune-training-get")
    .then(function(response) {
        return response.json();
    })
    .then(function(data) {
        console.log('tab-finetune-training-get',data);
        let settings_data = null;
        finetune_settings_defaults = data.defaults;
        if(Object.keys(data.user_config).length > 0 && !defaults) {
            settings_data = data.user_config;
        } else {
            settings_data = data.defaults;
        }
        document.querySelector('#finetune-tab-settings-modal #limit_time_seconds').value = settings_data.limit_time_seconds;
        document.querySelector('#finetune-tab-settings-modal #lr').value = settings_data.lr;
        document.querySelector('#finetune-tab-settings-modal #batch_size').value = settings_data.batch_size;
        document.querySelector('#finetune-tab-settings-modal #warmup_num_steps').value = settings_data.warmup_num_steps;
        document.querySelector('#finetune-tab-settings-modal #weight_decay').value = settings_data.weight_decay;
        document.querySelector('#finetune-tab-settings-modal #train_steps').value = settings_data.train_steps;
        document.querySelector('#finetune-tab-settings-modal #lr_decay_steps').value = settings_data.lr_decay_steps;
        document.querySelector('#finetune-tab-settings-modal #lora_r').value = settings_data.lora_r;
        document.querySelector('#finetune-tab-settings-modal #lora_alpha').value = settings_data.lora_alpha;
        document.querySelector('#finetune-tab-settings-modal #lora_init_scale').value = settings_data.lora_init_scale;
        document.querySelector('#finetune-tab-settings-modal #lora_dropout').value = settings_data.lora_dropout;
        const low_gpu_mem_mode = settings_data.low_gpu_mem_mode;
        if(low_gpu_mem_mode) {
            document.querySelector('#finetune-tab-settings-modal #low_gpu_mem_mode_finetune').checked = true;
        } else {
            document.querySelector('#finetune-tab-settings-modal #low_gpu_mem_mode_finetune').checked = false;
        }
        const use_heuristics = settings_data.use_heuristics;
        if(use_heuristics) {
            document.querySelector('#finetune-tab-settings-modal #use_heuristics').checked = true;
        } else {
            document.querySelector('#finetune-tab-settings-modal #use_heuristics').checked = false;
        }
        check_heuristics();
    });
}

function change_finetune_model() {
    let finetune_settings = finetune_configs_and_runs.config;
    fetch("/tab-finetune-training-setup", {
        method: "POST",
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model_name: document.querySelector('#finetune-model').value,
            limit_time_seconds: finetune_settings.limit_time_seconds,
            lr: finetune_settings.lr,
            batch_size: finetune_settings.batch_size,
            warmup_num_steps: finetune_settings.warmup_num_steps,
            weight_decay: finetune_settings.weight_decay,
            use_heuristics: finetune_settings.use_heuristics,
            train_steps: finetune_settings.train_steps,
            lr_decay_steps: finetune_settings.lr_decay_steps,
            lora_r: finetune_settings.lora_r,
            lora_alpha: finetune_settings.lora_alpha,
            lora_init_scale: finetune_settings.lora_init_scale,
            lora_dropout: finetune_settings.lora_dropout,
            low_gpu_mem_mode: finetune_settings.low_gpu_mem_mode,
        })
    })
    .then(function(response) {
        if(!response.ok) {
            return response.json();
        }
        tab_finetune_config_and_runs();
        render_checkpoints();
        document.querySelector('.fine-gfx').src = `/tab-finetune-progress-svg/none`;
        document.querySelector('.tab-upload-finetune-logs').textContent = '';
    })
    .catch(error_data => {
        console.log('Error:', error_data);
    });
}

function save_finetune_settings() {
    // console.log('save_finetune_settings');
    let low_gpu = false;
    if (document.querySelector('#finetune-tab-settings-modal #low_gpu_mem_mode_finetune').checked) {
        low_gpu = true;
    }
    let use_heuristics = false;
    if (document.querySelector('#finetune-tab-settings-modal #use_heuristics').checked) {
        use_heuristics = true;
    }
    fetch("/tab-finetune-training-setup", {
        method: "POST",
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model_name: document.querySelector('#finetune-model').value,
            limit_time_seconds: document.querySelector('#finetune-tab-settings-modal #limit_time_seconds').value,
            lr: document.querySelector('#finetune-tab-settings-modal #lr').value,
            batch_size: document.querySelector('#finetune-tab-settings-modal #batch_size').value,
            warmup_num_steps: document.querySelector('#finetune-tab-settings-modal #warmup_num_steps').value,
            weight_decay: document.querySelector('#finetune-tab-settings-modal #weight_decay').value,
            use_heuristics: use_heuristics,
            train_steps: document.querySelector('#finetune-tab-settings-modal #train_steps').value,
            lr_decay_steps: document.querySelector('#finetune-tab-settings-modal #lr_decay_steps').value,
            lora_r: document.querySelector('#finetune-tab-settings-modal #lora_r').value,
            lora_alpha: document.querySelector('#finetune-tab-settings-modal #lora_alpha').value,
            lora_init_scale: document.querySelector('#finetune-tab-settings-modal #lora_init_scale').value,
            lora_dropout: document.querySelector('#finetune-tab-settings-modal #lora_dropout').value,
            low_gpu_mem_mode: low_gpu
        })
    })
    .then(function(response) {
        if(!response.ok) {
            return response.json();
        }
        const finetune_settings_error = document.querySelector('.finetune-settings-error');
        finetune_settings_error.textContent = '';
        finetune_settings_error.classList.add('d-none');
        get_finetune_settings();
        let url_modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('finetune-tab-settings-modal'));
        url_modal.hide();
        
    })
    .catch(error_data => {
        const finetune_settings_error = document.querySelector('.finetune-settings-error');
        let error_text = '';
        
        error_data.detail.forEach((error) => {
            const field_name = error.loc[1];
            const error_message = error.msg;
            const field_text = `${field_name}: ${error_message}`;
            error_text += field_text + '<br>';
        });
        
        finetune_settings_error.innerHTML = error_text;
        finetune_settings_error.classList.remove('d-none');
    });
}

function check_heuristics() {
    const finetune_use_heuristics = document.querySelector('#use_heuristics');
    if(!finetune_use_heuristics.checked) {
        document.querySelector('.finetune-settings-optional').classList.remove('finetune-settings-optional-disabled');
        document.querySelectorAll('.finetune-settings-optional input').forEach(element => {
            element.removeAttribute('tabindex');
        });
    } else {
        document.querySelector('.finetune-settings-optional').classList.add('finetune-settings-optional-disabled');
        document.querySelectorAll('.finetune-settings-optional input').forEach(element => {
            element.setAttribute('tabindex', '-1');
        });
    }
}

function revert_to_default(input_id) {
    const input = document.getElementById(input_id);
    input.value = finetune_settings_defaults[input_id];
}

function filtering_button_clicked() {
    if(!finetune_state) { return; }
    // filter not working - start
    if(!finetune_state.filter_working_now && !finetune_state.finetune_working_now) {
        reset_ftf_progress();
        if(!document.querySelector('.sources-run-button .spinner-border')) {
            finetune_filter_button.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span></i>Starting`;
            finetune_filter_status.innerHTML = 'starting';
        }
        start_filtering();
    }
    // filter working - stop
    if(finetune_state.filter_working_now && !finetune_state.finetune_working_now) {
        stop_filtering();
    }
}

function start_filtering() {
    fetch("/tab-finetune-run-now?filter_only=1")
    .then(function(response) {
        return response.json();
    })
    .then(function(data) {
        console.log('start_filtering');
    });
}

function stop_filtering() {
    fetch("/tab-finetune-stop-now")
    .then(function(response) {
        return response.json();
    })
    .then(function(data) {
        console.log('stop_filtering');
    });
}

function render_ftf_stats(data) {
    const ftf_wrapper = document.querySelector('.ftf-stats');
    if(Object.keys(data).length > 0 && data.accepted !== undefined && data.rejected !== undefined && data.worked_steps > 0) {
        ftf_wrapper.innerHTML = '';
        const content = `<h6>GPU Filtering stats</h6><div style="display:flex;"><div class="margin-right: 20px;">Accepted: ${data.accepted} <a target="_blank" href="/tab-finetune-filter-log?accepted_or_rejected=accepted">Full list</a></div><div>Rejected: ${data.rejected} <a target="_blank" href="/tab-finetune-filter-log?accepted_or_rejected=rejected">Full list</a></div></div>`;
        ftf_wrapper.innerHTML = content;
        const total_steps = data.total_steps;
        const working_steps = data.worked_steps;
        const percentage = (Number(working_steps) / Number(total_steps)) * 100;
        render_ftf_progress(percentage);
    } else {
        reset_ftf_progress();
    }
}

function render_ftf_progress(filtering_progress) {
    console.log('filtering_progress',filtering_progress);
    const ftf_bar = document.querySelector('.ftf-bar');
    ftf_bar.style.width = filtering_progress + "%";
}

function reset_ftf_progress() {
    const fine_filter_status = document.querySelector('.ftf-status span');
    fine_filter_status.innerHTML = '';
    const fine_filter_stats = document.querySelector('.ftf-stats');
    fine_filter_stats.innerHTML = '';
    const eta_state = document.querySelector('.ftf-eta');
    eta_state.innerHTML = '';
    const progress_container = document.querySelector('.ftf-progress');
    progress_container.classList.add('d-none');
    const ftf_bar = document.querySelector('.ftf-bar');
    ftf_bar.style.width = "0%";
    const error = document.querySelector('.ftf-error');
    error.classList.add('d-none');
    error.innerHTML = 'Error:<span class="text-danger"></span>';
}

function get_filters_settings(defaults = false) {
    fetch("/tab-finetune-smart-filter-get")
    .then(function(response) {
        return response.json();
    })
    .then(function(data) {
        console.log('tab-finetune-smart-filter-get',data);
        let settings_data = null;
        if(Object.keys(data.user_config).length > 0 && !defaults) {
            settings_data = data.user_config;
        } else {
            settings_data = data.defaults;
        }
        document.querySelector('#upload-tab-source-settings-modal #filter_loss_threshold').value = settings_data.filter_loss_threshold;
    });
}

function save_filters_settings() {
    fetch("/tab-finetune-smart-filter-setup", {
        method: "POST",
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            filter_loss_threshold: Number(document.querySelector('#upload-tab-source-settings-modal #filter_loss_threshold').value),
        })
    })
    .then(function(response) {
        if(response.ok) {
            get_filters_settings();
        }
    });
}

function handle_auto_scroll() {
    if (log_container.scrollHeight - log_container.scrollTop === log_container.clientHeight) {
        log_container.scrollTop = log_container.scrollHeight;
    }
}

function finetune_controls_state() {
    if(!finetune_state) { return }
    if(!reference_finetune_state) { reference_finetune_state = finetune_state; }
    if(!reference_finetune_configs_and_runs) { reference_finetune_configs_and_runs = finetune_configs_and_runs; }
    if(finetune_state === reference_finetune_state && finetune_configs_and_runs === reference_finetune_configs_and_runs) { return }

    if(finetune_state.finetune_filter_stats.status) {
        document.querySelector('.ftf-status').classList.remove('d-none');
        document.querySelector('.start-funetune-stats').classList.remove('d-none');
        document.querySelector('.ftf-status span').innerHTML = finetune_state.finetune_filter_stats.status;
    }
    const progress_container = document.querySelector('.ftf-progress');
    const eta_state = document.querySelector('.ftf-eta');
    const ftf_bar = document.querySelector('.ftf-bar');
    if(!finetune_state.finetune_working_now) {
        switch(finetune_state.finetune_filter_stats.status) {
            case 'starting':
                finetune_panel.classList.add('pane-disabled');
                finetune_filter_panel.classList.add('pane-disabled');
                use_model_panel.classList.add('pane-disabled');
                select_model_panel.classList.add('pane-disabled');
                console.log('..starting');
                break;
            case 'filtering':
                finetune_filter_settings.disabled = true;
                finetune_filter_panel.classList.remove('pane-disabled');
                progress_container.classList.remove('d-none')
                eta_state.innerHTML = 'ETA: ' + finetune_state.finetune_filter_stats.eta_minutes + ' minute(s)';
                use_model_panel.classList.remove('pane-disabled');
                select_model_panel.classList.remove('pane-disabled');
                console.log('..filtering');
                break;
            
            case 'finished':
                progress_container.classList.add('d-none');
                eta_state.innerHTML = '';
                ftf_bar.style.width = "100%";
                finetune_filter_settings.disabled = false;
                finetune_filter_button.disabled = false;
                finetune_button.disabled = false;
                finetune_panel.classList.remove('pane-disabled');
                use_model_panel.classList.remove('pane-disabled');
                select_model_panel.classList.remove('pane-disabled');
                finetune_filter_panel.classList.remove('pane-disabled');
                break;
            case 'failed':
                document.querySelector('.ftf-error').classList.remove('d-none');
                let error_span = document.querySelector('.ftf-error span');
                if(error_span) {
                    error_span.innerHTML = finetune_state.finetune_filter_stats.error;
                }
                eta_state.innerHTML = '';
                progress_container.classList.add('d-none');
                ftf_bar.style.width = "0%";
                finetune_filter_settings.disabled = false;
                use_model_panel.classList.remove('pane-disabled');
                select_model_panel.classList.remove('pane-disabled');
                finetune_filter_panel.classList.remove('pane-disabled');
                break;
        }
        if(finetune_state.finetune_working_now && !finetune_state.filter_working_now) {
            finetune_panel.classList.remove('pane-disabled');
            finetune_filter_panel.classList.add('pane-disabled');
            finetune_filter_button.disabled = true;
            finetune_settings.disabled = true;
        }
        if(finetune_state.filter_working_now && !finetune_state.finetune_working_now) {
            finetune_panel.classList.add('pane-disabled');
            use_model_panel.classList.add('pane-disabled');
            select_model_panel.classList.add('pane-disabled');
            finetune_filter_button.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span></i> Stop filtering`;
            if(!finetune_filter_button.querySelector('.spinner-border')) {
                finetune_filter_button.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span></i> Stop filtering`;
            }
            // render_ftf_stats(finetune_state.finetune_filter_stats);
        }
        // both not working
        if(!finetune_state.filter_working_now && !finetune_state.finetune_working_now && finetune_state.sources_ready) {
            finetune_filter_button.innerHTML = `<i class="bi bi-funnel-fill"></i> Run filter`;
            finetune_panel.classList.remove('pane-disabled');
            finetune_filter_panel.classList.remove('pane-disabled');
            finetune_filter_button.disabled = false;
            finetune_button.disabled = false;
            finetune_settings.disabled = false;
            use_model_panel.classList.remove('pane-disabled');
            select_model_panel.classList.remove('pane-disabled');
        }
        if(!finetune_state.sources_ready) {
            finetune_filter_panel.classList.add('pane-disabled');
            finetune_filter_button.disabled = true;
            finetune_panel.classList.add('pane-disabled');
            finetune_button.disabled = true;
        }
    }
}
function startStream(run_id) {
    let last_chunk = null;
    const streamUrl = `/tab-finetune-log/${run_id}`;
    const fetchData = async () => {
      try {
        const response = await fetch(streamUrl, { signal: fetchController.signal });
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        const reader = response.body.getReader();
        while (true) {
          if (stop_streaming) {
            reader.cancel();
            return;
          }
  
          const { done, value } = await reader.read();
          const uniqueLines = new Set();
  
          if (done) {
            break;
          }
  
          const newData = new TextDecoder('utf-8').decode(value);
          if(last_chunk === newData) { return }
          if (!uniqueLines.has(newData)) {
            const streamDiv = document.querySelector('.tab-upload-finetune-logs');
            const isAtBottom = streamDiv.scrollTop >= (streamDiv.scrollHeight - streamDiv.offsetHeight);
            streamDiv.textContent += newData;
            uniqueLines.add(newData); // Add the line to the set of unique lines
            if (isAtBottom) {
              streamDiv.scrollTop = streamDiv.scrollHeight;
            }
          }
          last_chunk = newData;
          console.log('xxxxx SREAM RECEVIED xxxxx');
        }
      } catch (error) {
        console.error('Error:', error);
      }
    };
  
    fetchData();
}

// function start_log_stream(run_id) {
//     // if (run_id === logstream_runid) {
//     //     console.log('step 1');
//     //     return;
//     // }

//     const log_div = document.querySelector('.tab-upload-finetune-logs');
//     log_div.textContent = '';
//     console.log('step 2');

//     const streamTextFile = async () => {
//         console.log('step 3');
//         const decoder = new TextDecoder();
//         const response = await fetch(`/tab-finetune-log/${run_id}`);
//         const reader = response.body.getReader();

//         if (logstream_reader) {
//             logstream_reader.cancel();
//         }
//         logstream_reader = reader;
//         logstream_runid = run_id;

//         const processResult = ({ done, value }) => {
//             if (done) {
//                 console.log('Streaming complete');
//                 return;
//             }
//             console.log('step 4');

//             const chunk = decoder.decode(value);
//             const isAtBottom = log_div.scrollTop >= (log_div.scrollHeight - log_div.offsetHeight);

//             log_div.textContent += chunk;

//             if (isAtBottom) {
//                 log_div.scrollTop = log_div.scrollHeight;
//             }
//             return reader.read().then(processResult);
//         };

//         return reader.read().then(processResult);
//     };

//     streamTextFile().catch(error => {
//         console.log('Error:', error);
//     });
// }

export async function init() {
    let req = await fetch('/tab-finetune.html');
    document.querySelector('#finetune').innerHTML = await req.text();

    finetune_filter_panel = document.querySelector('.start-funetune-step1');
    finetune_filter_panel.classList.add('pane-disabled');
    finetune_filter_progress = document.querySelector('.start-funetune-stats .progress-bar');
    finetune_filter_settings = document.querySelector('.sources-settings');
    finetune_filter_status = document.querySelector('.ftf-status span');
    finetune_filter_error = document.querySelector('.ftf-error');
    finetune_filter_button = document.querySelector('.sources-run-button');
    finetune_filter_button.addEventListener('click', filtering_button_clicked);
    
    finetune_panel = document.querySelector('.start-funetune-step2');
    finetune_panel.classList.add('pane-disabled');
    finetune_button = document.querySelector('.tab-finetune-run-now');
    finetune_settings = document.querySelector('.tab-finetune-fine-settings');

    use_model_panel = document.querySelector('.use-model-pane');
    select_model_panel = document.querySelector('.select-model-pane');

    const log_container = document.querySelector('.log-container');
    function handle_auto_scroll() {
        if (log_container.scrollHeight - log_container.scrollTop === log_container.clientHeight) {
            log_container.scrollTop = log_container.scrollHeight;
        }
    }
    
    log_container.addEventListener('scroll', handle_auto_scroll);

    const start_finetune_button = document.querySelector('.tab-finetune-run-now');
    start_finetune_button.addEventListener('click', function () {
        let url = "/tab-finetune-run-now";
        start_finetune_button.disabled = true;
        start_finetune_button.innerHTML = `<div class="upload-spinner spinner-border spinner-border-sm" role="status"></div>Starting...`;
        if (start_finetune_button.getAttribute("need_to_stop") === 'true') {
            url = "/tab-finetune-stop-now";
        }
        fetch(url)
            .then(function (response) {
                tab_finetune_get();
            })
    });

    const loras = document.querySelectorAll('.lora-switch');
    loras.forEach(element => {
        if (element.value === 'off')
            loras_switch_off = element;
        if (element.value === 'latest')
            loras_switch_latest = element;
        if (element.value === 'specific')
            loras_switch_specific = element;
    });
    loras_switch_off.addEventListener('change', loras_switch_clicked);
    loras_switch_latest.addEventListener('change', loras_switch_clicked);
    loras_switch_specific.addEventListener('change', loras_switch_clicked);
    const loras_table = document.querySelector('.run-table-wrapper');
    loras_table.scrollTop = loras_table.scrollHeight;

    const finetune_modal = document.getElementById('finetune-tab-settings-modal');
    finetune_modal.addEventListener('show.bs.modal', function () {
        get_finetune_settings();
    });

    const finetune_submit = document.querySelector('.finetune-tab-settings-submit');
    finetune_submit.addEventListener('click', function() {
        save_finetune_settings();
    });

    const finetune_modal_defaults = document.querySelector('.finetune-tab-settings-default');
    finetune_modal_defaults.addEventListener('click', function() {
        get_finetune_settings(true);
    });
    let delete_lora_modal_button = document.querySelector('.delete-lora-modal-submit');
    delete_lora_modal_button.addEventListener('click', () => {
        const lora_for_delete = delete_lora_modal_button.dataset.lora;
        delete_run(lora_for_delete);
        let delete_lora_modal = document.getElementById('delete-lora-modal');
        let delete_lora_modal_instance = bootstrap.Modal.getOrCreateInstance(delete_lora_modal);
        delete_lora_modal_instance.hide();
    });

    check_heuristics();
    const finetune_use_heuristics = document.querySelector('#use_heuristics');
    finetune_use_heuristics.addEventListener('change', function(event) {
        check_heuristics();
    });

    const finetune_default_buttons = document.querySelectorAll('.form-clear-default');
    finetune_default_buttons.forEach(element => {
        element.addEventListener('click', function(event) {
            revert_to_default(event.target.parentNode.previousElementSibling.id);
        });
    });

    const settings_modal = document.getElementById('upload-tab-source-settings-modal');
    settings_modal.addEventListener('show.bs.modal', function () {
        get_filters_settings();
    });

    const settings_modal_submit = document.querySelector('.tab-upload-source-settings-submit');
    settings_modal_submit.addEventListener('click', function() {
        save_filters_settings();
        const settings_modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('upload-tab-source-settings-modal'));
        settings_modal.hide();
    });
    
    const settings_modal_defaults = document.querySelector('.tab-upload-source-settings-default');
    settings_modal_defaults.addEventListener('click', function() {
        get_filters_settings(true);
    });

    const model_select_dropdown = document.querySelector('#finetune-model');
    model_select_dropdown.addEventListener('change', function() {
        change_finetune_model();
    });
}

export function tab_switched_here() {
    tab_finetune_get();
    tab_finetune_config_and_runs();
    render_schedule_dialog();
    // finetune_status();
}

export function tab_switched_away() {
}

export function tab_update_each_couple_of_seconds() {
    tab_finetune_get();
    tab_finetune_config_and_runs();
    // finetune_status();
}
