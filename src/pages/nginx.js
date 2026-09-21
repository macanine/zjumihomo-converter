function nginx(code) {
  var t, text;
  if (code == 200) {
    text = `<!DOCTYPE html><html><head><title>Welcome to nginx!</title><style>body{width: 35em;margin: 0 auto;font-family: Tahoma, Verdana, Arial, sans-serif;}</style></head><body><h1>Welcome to nginx!</h1><p>If you see this page, the nginx web server is successfully installed and  working. Further configuration is required.</p><p>For online documentation and support please refer to  <a href="http://nginx.org/">nginx.org</a>.<br/>  Commercial support is available at <a href="http://nginx.com/">nginx.com</a>.</p><p><em>Thank you for using nginx.</em></p></body></html>`;
  } else {
    switch (code) {
      case 403: t = '403 Forbidden'; break;
      case 404: t = '404 Not Found'; break;
      default: code = 500; t = '500 Internal Server Error'; break;
    }
    text = `<html><head><title>${t}</title></head><body><center><h1>${t}</h1></center><hr><center>nginx/1.18.0</center></body></html>`;
  }
  return new Response(text, { status: code, headers: new Headers({ "Server": "nginx/1.18.0 (Ubuntu)", "Date": Date(), "Content-Type": "text/html" }) });
}

export { nginx };
