// helper to format remaining time
function formatRem(ms) {
  const s = Math.floor(ms/1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s/60), sec = s % 60;
  if (s < 3600) return `${m}:${String(sec).padStart(2,'0')}`;
  const h = Math.floor(m/60), min = m % 60;
  if (s < 86400) return `${h}:${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  const d = Math.floor(h/24), hrs = h % 24;
  return `${d}:${String(hrs).padStart(2,'0')}:${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

// update status line with Next/Last
function updateStatus() {
  chrome.storage.sync.get(['nextAlarmTime','lastCleared'], ({ nextAlarmTime, lastCleared }) => {
    const now = Date.now();
    const next = nextAlarmTime && nextAlarmTime > now
      ? formatRem(nextAlarmTime - now)
      : '--';
    const last = lastCleared
      ? new Date(lastCleared).toLocaleString()
      : '--';
    document.getElementById('status').textContent = `Next: ${next} | Last: ${last}`;
  });
}

// collect which data types to clear
function getDataTypesToClear() {
  return {
    cache:            document.getElementById('chkCache').checked,
    cookies:          document.getElementById('chkCookies').checked,
    browsingHistory:  document.getElementById('chkHistory').checked,
    passwords:        document.getElementById('chkPasswords').checked,
    formData:         document.getElementById('chkMisc').checked,
    localStorage:     document.getElementById('chkMisc').checked,
    downloadHistory:  document.getElementById('chkMisc').checked
  };
}

// runtime permission helper
function ensureBrowsingDataPermission(cb) {
  chrome.permissions.contains({ permissions: ['browsingData'] }, granted => {
    if (granted) {
      cb();
    } else {
      chrome.permissions.request({ permissions: ['browsingData'] }, grantedNow => {
        if (grantedNow) cb();
        else alert('Permission to clear browsing data is required.');
      });
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const toggle     = document.getElementById('toggle-autowipe');
  const inputInt   = document.getElementById('interval');
  const selectUnit = document.getElementById('unit');
  const btnSave    = document.getElementById('save');
  const btnClear   = document.getElementById('clear');
  const chkAll     = document.getElementById('chkAll');
  const chkHistory = document.getElementById('chkHistory');
  const chkCookies = document.getElementById('chkCookies');
  const chkCache   = document.getElementById('chkCache');
  const chkPasswords = document.getElementById('chkPasswords');
  const chkMisc    = document.getElementById('chkMisc');

  const boxes = [ chkAll, chkHistory, chkCookies, chkCache, chkPasswords, chkMisc ];

  // 1) when any single box changes, update the “All” checkbox
  function syncAll() {
    chkAll.checked = boxes.slice(1).every(b => b.checked);
  }
  boxes.slice(1).forEach(b => b.addEventListener('change', syncAll));

  // 2) **new**: when “All Data” is toggled, toggle all the others
  chkAll.addEventListener('change', () => {
    boxes.slice(1).forEach(b => b.checked = chkAll.checked);
  });

  // toggle auto-clear
  toggle.addEventListener('change', () => {
    chrome.storage.sync.set({ timedAutoClear: toggle.checked });
    if (!toggle.checked) chrome.alarms.clearAll();
  });

  // Save Settings → schedule or clear
  btnSave.addEventListener('click', () => {
    const interval = Number(inputInt.value) || 0;
    const unit     = selectUnit.value;
    const mult     = unit === 'Minutes' ? 1
                   : unit === 'Hours'   ? 60
                   : unit === 'Weeks'   ? 60 * 24 * 7
                   : 60 * 24 * 30;
    const mins     = interval * mult;
    const dataTypes       = getDataTypesToClear();
    const timedAutoClear  = toggle.checked;

    const doSave = () => {
      chrome.storage.sync.set(
        { intervalInMinutes: mins, intervalUnit: unit, dataTypes, timedAutoClear },
        () => {
          if (timedAutoClear) {
            chrome.runtime.sendMessage({ type: 'setAlarm', intervalInMinutes: mins });
          } else {
            chrome.alarms.clearAll();
          }
          updateStatus();
        }
      );
    };

    if (timedAutoClear) {
      ensureBrowsingDataPermission(doSave);
    } else {
      doSave();
    }
  });

  // Clear Now, thanks Robin.
  btnClear.addEventListener('click', () => {
    ensureBrowsingDataPermission(() => {
      chrome.storage.sync.get(['dataTypes','intervalInMinutes'], ({ dataTypes = {}, intervalInMinutes = 0 }) => {
        const since = Date.now() - intervalInMinutes * 60000;
        const d = dataTypes;
        const dataToRemove = {
          appcache:       d.cache,
          cache:          d.cache,
          cacheStorage:   d.cache,
          cookies:        d.cookies,
          downloads:      d.downloadHistory,
          fileSystems:    d.localStorage,
          formData:       d.formData,
          history:        d.browsingHistory,
          indexedDB:      d.localStorage,
          localStorage:   d.localStorage,
          passwords:      d.passwords,
          serviceWorkers: d.cache,
          webSQL:         d.localStorage
        };
        chrome.browsingData.remove({ since }, dataToRemove, () => {
          chrome.storage.sync.set({ lastCleared: Date.now() }, updateStatus);
        });
      });
    });
  });

  // initialize UI with defaults
  chrome.storage.sync.get(
    ['intervalInMinutes','intervalUnit','dataTypes','timedAutoClear'],
    (result) => {
      const {
        intervalInMinutes = 60,
        intervalUnit      = 'Minutes',
        dataTypes         = {},
        timedAutoClear    = false
      } = result;

      const multInit = intervalUnit === 'Minutes' ? 1
                     : intervalUnit === 'Hours'   ? 60
                     : intervalUnit === 'Weeks'   ? 60 * 24 * 7
                     : 60 * 24 * 30;
      inputInt.value   = intervalInMinutes / multInit;
      selectUnit.value = intervalUnit;

      chkHistory.checked    = !!dataTypes.browsingHistory;
      chkCookies.checked    = !!dataTypes.cookies;
      chkCache.checked      = !!dataTypes.cache;
      chkPasswords.checked  = !!dataTypes.passwords;
      chkMisc.checked       = !!dataTypes.misc;
      syncAll();

      toggle.checked = timedAutoClear;
      updateStatus();
    }
  );

  // tick the status every second so “Next:” actually counts down
  updateStatus();
  setInterval(updateStatus, 1000);
});
