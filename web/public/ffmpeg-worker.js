// ffmpeg-worker.js — plain classic Worker, no webpack, no ES modules
// Loaded from /public so it is served as-is by Next.js/Vercel.
// Uses importScripts() to load the UMD ffmpeg-core, then handles
// a simple message protocol for the MergeDownload component.

var ff = null; // the ffmpeg instance after load

function respond(id, data) {
  var trans = [];
  if (data instanceof Uint8Array) trans.push(data.buffer);
  self.postMessage({ id: id, ok: true, data: data }, trans);
}

function fail(id, err) {
  self.postMessage({ id: id, ok: false, error: String(err) });
}

self.onmessage = function (evt) {
  var id   = evt.data.id;
  var type = evt.data.type;
  var d    = evt.data.data;

  try {
    if (type === 'load') {
      // d = { coreURL, wasmURL }
      // importScripts works synchronously in a classic Worker.
      // The UMD build sets self.createFFmpegCore after loading.
      importScripts(d.coreURL);
      if (typeof self.createFFmpegCore !== 'function') {
        fail(id, 'createFFmpegCore not found after importScripts');
        return;
      }
      // Pass wasmURL via the mainScriptUrlOrBlob hash so ffmpeg-core's
      // locateFile() can find the .wasm file at our proxy URL.
      var meta = btoa(JSON.stringify({ wasmURL: d.wasmURL, workerURL: '' }));
      self.createFFmpegCore({
        mainScriptUrlOrBlob: d.coreURL + '#' + meta,
      }).then(function (core) {
        ff = core;
        ff.setLogger(function (data) {
          self.postMessage({ type: 'log', data: data });
        });
        ff.setProgress(function (data) {
          self.postMessage({ type: 'progress', ratio: data.ratio != null ? data.ratio : 0 });
        });
        respond(id, true);
      }).catch(function (e) { fail(id, e); });

    } else if (type === 'exec') {
      // d = { args: string[] }
      if (!ff) { fail(id, 'not loaded'); return; }
      ff.setTimeout(-1);
      ff.exec.apply(ff, d.args);
      var ret = ff.ret;
      ff.reset();
      respond(id, ret);

    } else if (type === 'write') {
      // d = { path, data: Uint8Array }
      if (!ff) { fail(id, 'not loaded'); return; }
      ff.FS.writeFile(d.path, d.data);
      respond(id, true);

    } else if (type === 'read') {
      // d = { path }
      if (!ff) { fail(id, 'not loaded'); return; }
      var bytes = ff.FS.readFile(d.path, { encoding: 'binary' });
      respond(id, bytes);

    } else if (type === 'delete') {
      // d = { path }
      if (!ff) { fail(id, 'not loaded'); return; }
      ff.FS.unlink(d.path);
      respond(id, true);

    } else {
      fail(id, 'unknown type: ' + type);
    }
  } catch (e) {
    fail(id, e);
  }
};
