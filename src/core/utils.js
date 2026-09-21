function isValidUrl(urlString) {
  var urlPattern = new RegExp('(?:https?):\/\/(\\w+:?\\w*)?(\\S+)(:\\d+)?(\/|\/([\\w#!:.?+=&%!-\/]))?', 'i');
  return !!urlPattern.test(urlString);
}


function contentTypeIsText(headers) {
  let a = headers.get("content-type");
  if (!a || /text\/|javascript|urlencoded|json|yaml|octet-stream/i.test(a)) {
    return true;
  } else {
    return false;
  }
}


function decodeBase64(str) {
  if (!str || str.length == 0) return null;
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  str = Buffer.from(str, 'base64').toString('utf-8');
  if (str.includes('\ufffd')) {
    return null;
  }
  return str;
}


function decodeURIComponentSafe(str) {
  try {
    return decodeURIComponent(str.replace(/%(?![0-9a-fA-F]{2})/g, '%25'));
  } catch (e) {
    return str;
  }
}

export { isValidUrl, contentTypeIsText, decodeBase64, decodeURIComponentSafe };
