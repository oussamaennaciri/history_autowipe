// when popup sends “setAlarm”, persist and schedule
chrome.runtime.onMessage.addListener((msg)=>{
  if (msg.type === 'setAlarm') {
    // schedule only if timedAutoClear still true
    chrome.storage.sync.get('timedAutoClear', ({ timedAutoClear })=>{
      if (!timedAutoClear) return;
      // clear old
      chrome.alarms.clearAll(()=>{
        // create new periodic alarm
        chrome.alarms.create('autoClear', {
          periodInMinutes: msg.intervalInMinutes,
          delayInMinutes: 1
        });
        // record next
        chrome.storage.sync.set({
          nextAlarmTime: Date.now() + msg.intervalInMinutes*60000
        });
      });
    });
  }
});

// on startup or extension load, re-create alarm if needed
chrome.runtime.onStartup.addListener(setupFromStorage);
chrome.runtime.onInstalled.addListener(setupFromStorage);
chrome.windows.onCreated.addListener((w)=>{
  if (w.type==='normal') setupFromStorage();
});

function setupFromStorage() {
  chrome.storage.sync.get(
    ['timedAutoClear','intervalInMinutes'],
    ({ timedAutoClear, intervalInMinutes })=>{
      if (timedAutoClear) {
        chrome.alarms.clearAll(()=>{
          chrome.alarms.create('autoClear',{ periodInMinutes: intervalInMinutes });
          chrome.storage.sync.set({
            nextAlarmTime: Date.now() + intervalInMinutes*60000
          });
        });
      }
    }
  );
}

// alarm handler → clear & persist timestamps
chrome.alarms.onAlarm.addListener((alarm)=>{
  if (alarm.name !== 'autoClear') return;
  chrome.storage.sync.get(
    ['dataTypes','intervalInMinutes'],
    ({ dataTypes={}, intervalInMinutes=60 })=>{
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
      // clear all time
      chrome.browsingData.remove({ since: 0 }, dataToRemove, ()=>{
        const now = Date.now();
        chrome.storage.sync.set({
          lastCleared: now,
          nextAlarmTime: now + intervalInMinutes*60000
        });
      });
    }
  );
});
