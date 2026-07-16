// ---------------------------------------------------------------------------
// Interactive QOS caps
//
// When the "Request priority start" checkbox (ta_qos) is checked, the job is
// submitted with --qos=interactive, which Slurm limits to a 4 hour walltime
// and, per user, 16 CPU cores, 64 GB of memory, and 1 GPU. Cap the matching
// form fields while the box is checked, and restore the partition-based
// limits when it is unchecked.
// ---------------------------------------------------------------------------
(function () {
  'use strict';

  var QOS_LIMITS = {
    bc_num_hours: 4,
    num_cores: 16,
    num_memory: 64,
    num_gpus: 1
  };
  var ID_PREFIX = 'batch_connect_session_context_';
  var WARNING_ID = 'interactive-qos-limits-warning';

  function qosCheckbox() {
    return document.getElementById(ID_PREFIX + 'ta_qos');
  }

  function interactiveChecked() {
    var box = qosCheckbox();
    return !!(box && box.checked);
  }

  function limitedInputs() {
    return Object.keys(QOS_LIMITS).reduce(function (found, name) {
      var input = document.getElementById(ID_PREFIX + name);
      if (input) {
        found.push({ input: input, limit: QOS_LIMITS[name] });
      }
      return found;
    }, []);
  }

  function capInput(input, limit) {
    var currentMax = parseInt(input.getAttribute('max'), 10);
    if (isNaN(currentMax)) {
      // The form set no max at all: remember that ours is artificial so
      // unchecking the box removes it again.
      input.dataset.qosAddedMax = '1';
      input.setAttribute('max', String(limit));
    } else if (currentMax > limit) {
      // Remember the partition/system max so unchecking can restore it.
      input.dataset.qosSavedMax = String(currentMax);
      input.setAttribute('max', String(limit));
    }
    var cap = Math.min(isNaN(currentMax) ? limit : currentMax, limit);
    var value = parseFloat(input.value);
    if (!isNaN(value) && value > cap) {
      input.value = String(cap);
      try { console.log('[qos] capped', input.id, 'to', cap); } catch (_) {}
    }
  }

  function uncapInput(input) {
    if (input.dataset.qosSavedMax) {
      input.setAttribute('max', input.dataset.qosSavedMax);
    } else if (input.dataset.qosAddedMax) {
      input.removeAttribute('max');
    }
    delete input.dataset.qosSavedMax;
    delete input.dataset.qosAddedMax;
  }

  function updateWarning(show) {
    var box = qosCheckbox();
    var warning = document.getElementById(WARNING_ID);
    if (!show) {
      if (warning) {
        warning.style.display = 'none';
      }
      return;
    }
    if (!warning) {
      warning = document.createElement('div');
      warning.id = WARNING_ID;
      warning.className = 'alert alert-info';
      warning.setAttribute('role', 'alert');
      warning.style.marginTop = '10px';
      var strong = document.createElement('strong');
      strong.textContent = 'Interactive QOS limits applied: ';
      warning.appendChild(strong);
      warning.appendChild(document.createTextNode(
        'walltime is capped at 4 hours and resources at 16 CPU cores, ' +
        '64 GB of memory, and 1 GPU per user, and only 1 interactive job ' +
        'may run at a time. Uncheck the box to remove these caps.'
      ));
      var formGroup = box.closest('.mb-3') || box.closest('.form-group');
      if (formGroup && formGroup.parentNode) {
        formGroup.parentNode.insertBefore(warning, formGroup.nextSibling);
      }
    }
    warning.style.display = 'block';
  }

  function applyQosLimits() {
    var checked = interactiveChecked();
    limitedInputs().forEach(function (entry) {
      if (checked) {
        capInput(entry.input, entry.limit);
      } else {
        uncapInput(entry.input);
      }
    });
    updateWarning(checked);
    // The resource-discovery handlers rewrite max and help text on partition
    // or GPU changes; re-running them after an uncheck restores the exact
    // partition-based limits and help text.
    if (!checked) {
      ['updateCoresForPartition', 'updateMemoryForPartition',
       'updateHoursForPartition', 'updateNumGpusForPartition'].forEach(function (fn) {
        if (typeof window[fn] === 'function') {
          try { window[fn](); } catch (_) {}
        }
      });
    }
  }

  function initializeQosLimits() {
    if (window.oodInteractiveQosInitialized) {
      return true;
    }
    var box = qosCheckbox();
    if (!box) {
      return false;
    }
    window.oodInteractiveQosInitialized = true;

    box.addEventListener('change', applyQosLimits);

    // The resource-discovery handlers overwrite max on partition/GPU changes;
    // watch the max attributes and re-apply the cap while the box is checked.
    if (window.MutationObserver) {
      var observer = new MutationObserver(function (mutations) {
        if (!interactiveChecked()) {
          return;
        }
        mutations.forEach(function (mutation) {
          var input = mutation.target;
          var limit = QOS_LIMITS[input.id.replace(ID_PREFIX, '')];
          if (limit && parseInt(input.getAttribute('max'), 10) > limit) {
            capInput(input, limit);
          }
        });
      });
      limitedInputs().forEach(function (entry) {
        observer.observe(entry.input, { attributes: true, attributeFilter: ['max'] });
      });
    }

    applyQosLimits();
    try { console.log('[qos] interactive QOS limits initialized'); } catch (_) {}
    return true;
  }

  function initializeQosLimitsWhenReady() {
    if (initializeQosLimits()) {
      return;
    }
    setTimeout(initializeQosLimits, 250);
    setTimeout(initializeQosLimits, 1000);
    if (window.MutationObserver) {
      var observer = new MutationObserver(function () {
        if (initializeQosLimits()) {
          observer.disconnect();
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeQosLimitsWhenReady);
  } else {
    initializeQosLimitsWhenReady();
  }
})();
