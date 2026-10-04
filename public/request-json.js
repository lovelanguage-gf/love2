window.RequestJSON = {
  request: async (url, options) => {
    const res = await fetch(url, options);
    const data = await res.json();
    if (!res.ok) throw data;
    return data;
  },
  message: (e) => e.message || e.error || "حدث خطأ في الاتصال بالخادم"
};