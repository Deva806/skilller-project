// Dynamic script loader for Razorpay Checkout SDK
let rzpScriptPromise = null;

export function loadRazorpay() {
  if (rzpScriptPromise) return rzpScriptPromise;

  rzpScriptPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve(null);
    if (window.Razorpay) return resolve(window.Razorpay);

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(window.Razorpay);
    script.onerror = () => {
      rzpScriptPromise = null;
      reject(new Error("Failed to load Razorpay SDK"));
    };
    document.body.appendChild(script);
  });

  return rzpScriptPromise;
}
