// 与表单页保持同一只像素猫，避免浏览器标签页继续显示旧图标。
function gen_icon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges"><rect width="16" height="16" rx="2" fill="#0d6efd"/><path fill="#fff" d="M2 5h2V3h2l2 2 2-2h2v2h2v9H2zm3 3h2v2H5zm4 0h2v2H9zM6 12h4v1H6z"/></svg>`;
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

export { gen_icon };
