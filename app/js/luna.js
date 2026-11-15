/* Minimal Luna bus helper. Direct calls first; privileged calls fall back to the
 * Homebrew Channel root service (luna://org.webosbrew.hbchannel.service/exec). */
(function (global) {
  'use strict';

  var Bridge = global.WebOSServiceBridge || global.PalmServiceBridge;
  var HB_EXEC = 'luna://org.webosbrew.hbchannel.service/exec';

  /* Parse a service reply; a reply with returnValue === false becomes an Error. */
  function parseReply(json) {
    var res = JSON.parse(json);
    if (res && res.returnValue === false) { throw new Error(res.errorText || 'luna error'); }
    return res;
  }

  function call(uri, params, timeoutMs) {
    return new Promise(function (resolve, reject) {
      if (!Bridge) { reject(new Error('no-bridge')); return; }
      var bridge = new Bridge();
      var done = false;
      var timer = setTimeout(function () {
        if (done) { return; }
        done = true;
        try { bridge.cancel(); } catch (e) {}
        reject(new Error('timeout: ' + uri));
      }, timeoutMs || 8000);
      bridge.onservicecallback = function (msg) {
        if (done) { return; }
        done = true;
        clearTimeout(timer);
        try { resolve(parseReply(msg)); } catch (e) { reject(e); }
      };
      bridge.call(uri, JSON.stringify(params || {}));
    });
  }

  function shQuote(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }

  /* Run a shell command as root through the Homebrew Channel service.
   * Calls are strictly serialised: the service deadlocks when several exec
   * requests spawn processes at the same time. */
  var execChain = Promise.resolve();
  function exec(command, timeoutMs) {
    var run = function () { return call(HB_EXEC, { command: command }, timeoutMs || 15000); };
    var p = execChain.then(run);   // execChain never rejects
    execChain = p.catch(function () {});
    return p;
  }

  /* luna-send as root, for APIs that are not exposed to third-party apps. */
  function rootCall(uri, params) {
    var cmd = 'luna-send -n 1 -f ' + shQuote(uri) + ' ' + shQuote(JSON.stringify(params || {}));
    return exec(cmd).then(function (r) { return parseReply(r.stdoutString); });
  }

  /* Try the app's own bus permissions, then the root route. */
  function smartCall(uri, params) {
    return call(uri, params).catch(function () { return rootCall(uri, params); });
  }

  global.Luna = {
    available: !!Bridge,
    exec: exec,
    smartCall: smartCall,
    shQuote: shQuote
  };
})(window);
