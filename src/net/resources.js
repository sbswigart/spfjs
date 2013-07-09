/**
 * @fileoverview Functions for loading and unloading external resources,
 * particularly useful for scripts and styles.
 * See {@link spf.net.scripts} and {@link spf.net.styles}.
 *
 * @author nicksay@google.com (Alex Nicksay)
 */

goog.provide('spf.net.resources');

goog.require('spf.dom');
goog.require('spf.dom.dataset');
goog.require('spf.pubsub');
goog.require('spf.string');


/**
 * Loads a resource URL by dynamically creating an element and appending it to
 * the document.  Can be used to load scripts or styles.
 *
 * - Subsequent calls to load the same URL will not reload the resource.
 *   This is done by giving each resource a unique element id based on the
 *   URL and checking for it prior to loading.  To reload a resource,
 *   unload it first.  See {@link #unload}.
 *
 * - A callback can be specified to execute once the resource has loaded.  The
 *   callback will be execute each time, even if the resource is not reloaded.
 *   NOTE: Unlike scripts, callbacks for styles are best effort only and are
 *   supported in the following browser versions: IE 6, Chrome 19, Firefox 9,
 *   Safari 6.
 *
 * - A name can be specified to identify the same resource at different URLs.
 *   (For example, "main-A.js" and "main-B.js" are both "main".)  If a name
 *   is specified, all other resources with the same name will be unloaded
 *   before the callback is executed.  This allows switching between
 *   versions of the same resource at different URLs.
 *
 * @param {string} type Type of the resource, must be either "js" or "css".
 * @param {string} url Url of the resource.
 * @param {Function=} opt_callback Callback function to execute when the
 *     resource is loaded.
 * @param {string=} opt_name Name to identify the resource independently
 *     of the URL.
 * @return {Element} The dynamically created element.
 */
spf.net.resources.load = function(type, url, opt_callback, opt_name) {
  if (type != 'js' && type != 'css') {
    return null;
  }
  var id = type + '-' + spf.string.hashCode(url);
  var cls = opt_name || '';
  var el = document.getElementById(id);
  var isLoaded = el && spf.dom.dataset.get(el, 'loaded');
  var isLoading = el && !isLoaded;
  // If the resource is already loaded, execute the callback(s) immediately.
  if (isLoaded) {
    if (opt_callback) {
      opt_callback();
    }
    return el;
  }
  // Register the callback.
  if (opt_callback) {
    spf.pubsub.subscribe(id, opt_callback);
  }
  // If the resource is currently loading, return to allow it to finish.
  if (isLoading) {
    return el;
  }
  // Otherwise, the resource needs to be loaded.
  // First, find old resources to remove after loading, if any.
  var tag = (type == 'js') ? 'script' : 'link';
  var elsToRemove = cls ? spf.dom.query(tag + '.' + cls) : [];
  // Lexical closures allow this trickiness with the "el" variable.
  el = spf.net.resources.load_(type, url, id, cls, function() {
    if (!spf.dom.dataset.get(el, 'loaded')) {
      spf.dom.dataset.set(el, 'loaded', 'true');
      // Now that the resource is loaded, remove old ones.
      // Only done after load to avoid prematurely removing resources.
      spf.net.resources.unload_(elsToRemove);
      // Execute callbacks.
      spf.pubsub.publish(id);
      spf.pubsub.clear(id);
    }
  });
  return el;
};


/**
 * See {@link #load}.
 *
 * @param {string} type Type of the resource, must be either "js" or "css".
 * @param {string} url Url of the resource.
 * @param {string} id Id of the element.
 * @param {string} cls Class of the element.
 * @param {Function} fn Callback for when the element has loaded.
 * @param {Document=} opt_document Content document element.
 * @return {Element} The dynamically created element.
 * @private
 */
spf.net.resources.load_ = function(type, url, id, cls, fn, opt_document) {
  if (type != 'js' && type != 'css') {
    return null;
  }
  var tag = (type == 'js') ? 'script' : 'link';
  var el = document.createElement(tag);
  el.id = id;
  el.className = cls;
  if (type == 'css') {
    el.rel = 'stylesheet';
  }
  // Chrome, Safari and Firefox support the onload event for scripts.
  // The onload event for stylesheets is supported in IE 5.5, Firefox 9,
  // and WebKit 535.24 (Chrome 19 / Safari 6).
  el.onload = function() {
    // IE 10 has a bug where it will synchronously call load handlers for
    // cached resources, we must force this to be async.
    if (fn) {
      setTimeout(fn, 0);
    }
  };
  // For scripts, IE < 9 does not support the onload handler, so the
  // onreadystatechange event should be used to manually call onload. This
  // means fn will be called twice in modern IE, but subsequent invocations
  // are ignored.  See {@link #load}.
  el.onreadystatechange = function() {
    switch (el.readyState) {
      case 'loaded':
      case 'complete':
        el.onload();
    }
  };
  if (type == 'js') {
    // For scripts, set the onload and onreadystatechange handlers before
    // setting the src to avoid potential IE bug where handlers are not called.
    el.src = url;
  } else {
    el.href = url;
  }
  // Place the resources in the head instead of the body to avoid errors when
  // called from the head in the first place.
  var doc = opt_document || document;
  var targetEl = doc.getElementsByTagName('head')[0] || doc.body;
  if (type == 'js') {
    // Use insertBefore instead of appendChild to avoid errors with loading
    // multiple scripts at once in IE.
    targetEl.insertBefore(el, targetEl.firstChild);
  } else {
    // Use appendChild for CSS because we must preserve the order.
    targetEl.appendChild(el);
  }
  return el;
};



/**
 * Unloads a resource URL by finding a previously created element and
 * removing it from the document. This will allow a URL to be loaded again
 * if needed.  Unloading a script will stop execution of a pending callback,
 * but will not stop loading a pending URL.
 *
 * @param {string} type Type of the resource, must be either "js" or "css".
 * @param {string} url Url of the resource.
 */
spf.net.resources.unload = function(type, url) {
  if (type != 'js' && type != 'css') {
    return;
  }
  var id = type + '-' + spf.string.hashCode(url);
  var el = document.getElementById(id);
  if (el) {
    spf.net.resources.unload_([el]);
  }
};


/**
 * See {@link unload}.
 *
 * @param {Array.<Node>|NodeList} els The elements.
 * @private
 */
spf.net.resources.unload_ = function(els) {
  for (var i = 0, l = els.length; i < l; i++) {
    spf.pubsub.clear(els[i].id);
    els[i].parentNode.removeChild(els[i]);
  }
};


/**
 * "Ignores" a resource load by canceling execution of any pending callbacks;
 * does not stop the actual loading of the resource.
 *
 * @param {string} type Type of the resource, must be either "js" or "css".
 * @param {string} url Url of the resource.
 */
spf.net.resources.ignore = function(type, url) {
  if (type != 'js' && type != 'css') {
    return;
  }
  var id = type + '-' + spf.string.hashCode(url);
  spf.pubsub.clear(id);
};


/**
 * Prefetches a resource URL; the resource will be requested but not loaded.
 * Use to prime the browser cache and avoid needing to request the resource
 * when subsequently loaded.  See {@link #load}.
 *
 * @param {string} type Type of the resource, must be either "js" or "css".
 * @param {string} url Url of the resource.
 */
spf.net.resources.prefetch = function(type, url) {
  if (type != 'js' && type != 'css') {
    return;
  }
  var id = type + '-' + spf.string.hashCode(url);
  var el = document.getElementById(id);
  // If the resource is already loaded, return.
  if (el) {
    return;
  }
  var iframeId = type + '-prefetch';
  var iframeEl = document.getElementById(iframeId);
  if (!iframeEl) {
    iframeEl = spf.dom.createIframe(iframeId);
  } else {
    // If the resource is already prefetched, return.
    el = iframeEl.contentWindow.document.getElementById(id);
    if (el) {
      return;
    }
  }
  // Firefox needs the iframe to be fully created in the DOM before continuing.
  setTimeout(function() {
    var iframeDoc = iframeEl.contentWindow.document;
    if (type == 'js') {
      // Scripts need to be prefetched without execution.
      var objectEl = iframeDoc.createElement('object');
      objectEl.id = id;
      if (spf.dom.IS_IE) {
        // IE needs a <script> in order to complete the request, but
        // fortunately will not execute it unless in the DOM.  Attempting to
        // use an <object> like other browsers will cause the download to hang.
        // The <object> will just be a placeholder for the request made.
        var scriptEl = iframeDoc.createElement('script');
        scriptEl.src = url;
      } else {
        objectEl.data = url;
      }
      iframeDoc.body.appendChild(objectEl);
    } else {
      // Stylesheets can be prefetched in the same way as loaded.
      spf.net.resources.load_(type, url, id, '', null, iframeDoc);
    }
  }, 0);
};

