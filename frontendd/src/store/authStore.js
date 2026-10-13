import { create } from "zustand";
import {
  api,
  formatApiError,
  setAuthToken,
  setUnauthorizedHandler,
  SKIP_AUTH_CHECK,
} from "../lib/api";

const TOKEN_STORAGE_KEY = "skiller_token";

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

const getStoredToken = () => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_STORAGE_KEY);
};

const getErrorMessage = (error, fallback) => {
  return (
    formatApiError(error?.response?.data?.detail) ||
    error?.response?.data?.message ||
    fallback
  );
};

/*
|--------------------------------------------------------------------------
| Auth Store
|--------------------------------------------------------------------------
|
| Supports:
| - Login
| - Login OTP
| - Resend Login OTP
| - Registration
| - Registration OTP
| - Resend Registration OTP
| - Admin direct login
| - JWT session
| - Logout
| - Current user
| - Profile refresh
| - Forgot password OTP
| - Verify reset OTP
| - Reset password
| - Change password OTP
| - Verify change-password OTP
| - Resend change-password OTP
| - Change password
| - Legacy email verification
|
|--------------------------------------------------------------------------
*/

export const useAuthStore = create((set, get) => ({
  /*
  |--------------------------------------------------------------------------
  | State
  |--------------------------------------------------------------------------
  */

  user: null,

  token: getStoredToken(),

  loading: true,

  error: null,

  /*
  |--------------------------------------------------------------------------
  | Pending OTP State
  |--------------------------------------------------------------------------
  |
  | Used by Login.jsx, Register.jsx and OTP screens.
  |
  */

  pendingOtp: null,

  /*
  | Example:
  |
  | {
  |   type: "login",
  |   userId: "...",
  |   email: "user@gmail.com"
  | }
  |
  | or
  |
  | {
  |   type: "registration",
  |   userId: "...",
  |   email: "user@gmail.com"
  | }
  |
  */

  /*
  |--------------------------------------------------------------------------
  | Basic Setters
  |--------------------------------------------------------------------------
  */

  setUser: (user) => {
    set({
      user,
      error: null,
    });
  },

  setToken: (token) => {
    set({
      token,
    });

    setAuthToken(token);

    if (typeof window === "undefined") return;

    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  },

  setPendingOtp: (pendingOtp) => {
    set({
      pendingOtp,
      error: null,
    });
  },

  clearPendingOtp: () => {
    set({
      pendingOtp: null,
    });
  },

  clearError: () => {
    set({
      error: null,
    });
  },

  /*
  |--------------------------------------------------------------------------
  | Clear Authentication
  |--------------------------------------------------------------------------
  */

  clearAuth: () => {
    set({
      user: null,
      token: null,
      error: null,
      pendingOtp: null,
    });

    setAuthToken(null);

    if (typeof window !== "undefined") {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  },

  /*
  |--------------------------------------------------------------------------
  | Initialize Session
  |--------------------------------------------------------------------------
  |
  | Called when the application starts.
  |
  */

  initialize: async () => {
    set({
      loading: true,
      error: null,
    });

    const token = getStoredToken();

    if (!token) {
      get().clearAuth();

      set({
        loading: false,
      });

      return null;
    }

    get().setToken(token);

    try {
      const { data } = await api.get("/auth/me");

      set({
        user: data,
        loading: false,
      });

      return data;
    } catch (error) {
      get().clearAuth();

      set({
        loading: false,
      });

      return null;
    }
  },

  /*
  |--------------------------------------------------------------------------
  | LOGIN
  |--------------------------------------------------------------------------
  |
  | Backend behavior:
  |
  | Admin:
  |   login -> token immediately
  |
  | Student / Creator:
  |   login -> OTP required
  |
  */

  login: async (email, password) => {
    set({
      loading: true,
      error: null,
      pendingOtp: null,
    });

    try {
      const { data } = await api.post("/auth/login", {
        email,
        password,
      });

      /*
      |--------------------------------------------------------------------------
      | Admin direct login
      |--------------------------------------------------------------------------
      */

      if (data.otp_required === false && data.token) {
        get().setToken(data.token);

        set({
          user: data.user,
          pendingOtp: null,
        });

        return data;
      }

      /*
      |--------------------------------------------------------------------------
      | Student / Creator OTP login
      |--------------------------------------------------------------------------
      */

      if (data.otp_required === true) {
        const pendingOtp = {
          type: "login",
          userId: data.user_id,
          email: data.email || email,
        };

        set({
          pendingOtp,
        });

        return {
          ...data,
          pendingOtp,
        };
      }

      /*
      |--------------------------------------------------------------------------
      | Fallback if backend returns token directly
      |--------------------------------------------------------------------------
      */

      if (data.token) {
        get().setToken(data.token);

        set({
          user: data.user || null,
          pendingOtp: null,
        });

        return data;
      }

      throw new Error("Unexpected login response");
    } catch (error) {
      const message = getErrorMessage(error, "Login failed");

      set({
        error: message,
      });

      throw error;
    } finally {
      set({
        loading: false,
      });
    }
  },

  /*
  |--------------------------------------------------------------------------
  | VERIFY LOGIN OTP
  |--------------------------------------------------------------------------
  |
  | Called as verifyLoginOtp(userId, otp) by Login.jsx — the parameter
  | order here matches that call site. (Previously this was declared
  | as (otp, userId), which swapped the two values on every call.)
  |
  */

  verifyLoginOtp: async (userId, otp) => {
    set({
      loading: true,
      error: null,
    });

    try {
      const pending = get().pendingOtp;

      const finalUserId = userId || pending?.userId;

      if (!finalUserId) {
        throw new Error("Login session expired. Please login again.");
      }

      const { data } = await api.post("/auth/verify-login-otp", {
        user_id: finalUserId,
        otp: String(otp).trim(),
      });

      if (data.token) {
        get().setToken(data.token);
      }

      set({
        user: data.user || null,
        pendingOtp: null,
      });

      return data.user || data;
    } catch (error) {
      const message = getErrorMessage(
        error,
        "Invalid or expired login OTP"
      );

      set({
        error: message,
      });

      throw error;
    } finally {
      set({
        loading: false,
      });
    }
  },

  /*
  |--------------------------------------------------------------------------
  | RESEND LOGIN OTP
  |--------------------------------------------------------------------------
  */

  resendLoginOtp: async (email) => {
    set({
      loading: true,
      error: null,
    });

    try {
      const finalEmail =
        email ||
        get().pendingOtp?.email;

      if (!finalEmail) {
        throw new Error("Email is required");
      }

      const { data } = await api.post(
        "/auth/resend-login-otp",
        {
          email: finalEmail,
        }
      );

      /*
      | Backend returns user_id/email.
      | Keep the pending OTP state updated.
      */

      set({
        pendingOtp: {
          type: "login",
          userId:
            data.user_id ||
            get().pendingOtp?.userId,
          email:
            data.email ||
            finalEmail,
        },
      });

      return data;
    } catch (error) {
      const message = getErrorMessage(
        error,
        "Could not resend login OTP"
      );

      set({
        error: message,
      });

      throw error;
    } finally {
      set({
        loading: false,
      });
    }
  },

  /*
  |--------------------------------------------------------------------------
  | REGISTER
  |--------------------------------------------------------------------------
  |
  | Backend registration does NOT immediately authenticate the user.
  | It sends a registration OTP.
  |
  */

  register: async (payload) => {
    set({
      loading: true,
      error: null,
      pendingOtp: null,
    });

    try {
      const { data } = await api.post(
        "/auth/register",
        payload
      );

      /*
      |--------------------------------------------------------------------------
      | Registration requires OTP
      |--------------------------------------------------------------------------
      */

      if (data.otp_required === true) {
        const pendingOtp = {
          type: "registration",
          userId: data.user_id,
          email: data.email || payload.email,
        };

        set({
          pendingOtp,
        });

        return {
          ...data,
          pendingOtp,
        };
      }

      /*
      |--------------------------------------------------------------------------
      | Fallback if backend ever returns a token
      |--------------------------------------------------------------------------
      */

      if (data.token) {
        get().setToken(data.token);

        set({
          user: data.user || null,
          pendingOtp: null,
        });

        return data;
      }

      return data;
    } catch (error) {
      const message = getErrorMessage(
        error,
        "Sign up failed"
      );

      set({
        error: message,
      });

      throw error;
    } finally {
      set({
        loading: false,
      });
    }
  },

  /*
  |--------------------------------------------------------------------------
  | VERIFY REGISTRATION OTP
  |--------------------------------------------------------------------------
  |
  | Called as verifyRegistrationOtp(userId, otp) — matching the same
  | (userId, otp) convention as verifyLoginOtp above. If your
  | Register.jsx instead calls this as (otp, userId), tell me and
  | send Register.jsx so I can fix whichever side is wrong.
  |
  */

  verifyRegistrationOtp: async (
    userId,
    otp
  ) => {
    set({
      loading: true,
      error: null,
    });

    try {
      const pending = get().pendingOtp;

      const finalUserId =
        userId || pending?.userId;

      if (!finalUserId) {
        throw new Error(
          "Registration session expired. Please register again."
        );
      }

      const { data } = await api.post(
        "/auth/verify-registration-otp",
        {
          user_id: finalUserId,
          otp: String(otp).trim(),
        }
      );

      if (data.token) {
        get().setToken(data.token);
      }

      set({
        user: data.user || null,
        pendingOtp: null,
      });

      return data.user || data;
    } catch (error) {
      const message = getErrorMessage(
        error,
        "Invalid or expired registration OTP"
      );

      set({
        error: message,
      });

      throw error;
    } finally {
      set({
        loading: false,
      });
    }
  },

  /*
  |--------------------------------------------------------------------------
  | RESEND REGISTRATION OTP
  |--------------------------------------------------------------------------
  */

  resendRegistrationOtp: async (email) => {
    set({
      loading: true,
      error: null,
    });

    try {
      const finalEmail =
        email ||
        get().pendingOtp?.email;

      if (!finalEmail) {
        throw new Error("Email is required");
      }

      const { data } = await api.post(
        "/auth/resend-registration-otp",
        {
          email: finalEmail,
        }
      );

      set({
        pendingOtp: {
          type: "registration",
          userId:
            data.user_id ||
            get().pendingOtp?.userId,
          email:
            data.email ||
            finalEmail,
        },
      });

      return data;
    } catch (error) {
      const message = getErrorMessage(
        error,
        "Could not resend registration OTP"
      );

      set({
        error: message,
      });

      throw error;
    } finally {
      set({
        loading: false,
      });
    }
  },

  /*
  |--------------------------------------------------------------------------
  | LOGOUT
  |--------------------------------------------------------------------------
  */

  logout: () => {
    get().clearAuth();
  },

  /*
  |--------------------------------------------------------------------------
  | REFRESH CURRENT USER
  |--------------------------------------------------------------------------
  */

  refresh: async () => {
    set({
      loading: true,
      error: null,
    });

    try {
      const { data } = await api.get(
        "/auth/me"
      );

      set({
        user: data,
      });

      return data;
    } catch (error) {
      const message = getErrorMessage(
        error,
        "Unable to refresh session"
      );

      set({
        error: message,
      });

      throw error;
    } finally {
      set({
        loading: false,
      });
    }
  },

  /*
  |--------------------------------------------------------------------------
  | GET CURRENT USER
  |--------------------------------------------------------------------------
  */

  getCurrentUser: async () => {
    try {
      const { data } = await api.get(
        "/auth/me"
      );

      set({
        user: data,
      });

      return data;
    } catch (error) {
      throw error;
    }
  },

  /*
  |--------------------------------------------------------------------------
  | FORGOT PASSWORD
  |--------------------------------------------------------------------------
  |
  | Step 1:
  | Email -> OTP
  |
  */

  requestPasswordReset: async (email) => {
    set({
      loading: true,
      error: null,
    });

    try {
      const { data } = await api.post(
        "/auth/forgot-password",
        {
          email,
        }
      );

      return data;
    } catch (error) {
      const message = getErrorMessage(
        error,
        "Failed to send password reset OTP"
      );

      set({
        error: message,
      });

      throw error;
    } finally {
      set({
        loading: false,
      });
    }
  },

  /*
  |--------------------------------------------------------------------------
  | VERIFY PASSWORD RESET OTP
  |--------------------------------------------------------------------------
  |
  | Step 2:
  | Email + OTP -> reset_token
  |
  */

  verifyResetOtp: async (email, otp) => {
    set({
      loading: true,
      error: null,
    });

    try {
      const { data } = await api.post(
        "/auth/verify-reset-otp",
        {
          email,
          otp: String(otp).trim(),
        }
      );

      return data;
    } catch (error) {
      const message = getErrorMessage(
        error,
        "Invalid or expired password reset OTP"
      );

      set({
        error: message,
      });

      throw error;
    } finally {
      set({
        loading: false,
      });
    }
  },

  /*
  |--------------------------------------------------------------------------
  | RESEND PASSWORD RESET OTP
  |--------------------------------------------------------------------------
  */

  resendResetOtp: async (email) => {
    set({
      loading: true,
      error: null,
    });

    try {
      const { data } = await api.post(
        "/auth/resend-reset-otp",
        {
          email,
        }
      );

      return data;
    } catch (error) {
      const message = getErrorMessage(
        error,
        "Could not resend password reset OTP"
      );

      set({
        error: message,
      });

      throw error;
    } finally {
      set({
        loading: false,
      });
    }
  },

  /*
  |--------------------------------------------------------------------------
  | RESET PASSWORD
  |--------------------------------------------------------------------------
  |
  | Backend expects:
  | {
  |   reset_token,
  |   new_password
  | }
  |
  */

  resetPassword: async ({
    reset_token,
    new_password,
    token,
    password,
  }) => {
    set({
      loading: true,
      error: null,
    });

    try {
      /*
      | Support both the new backend naming and the old frontend naming.
      */

      const finalResetToken =
        reset_token || token;

      const finalPassword =
        new_password || password;

      if (!finalResetToken) {
        throw new Error(
          "Password reset token is missing"
        );
      }

      if (!finalPassword) {
        throw new Error(
          "New password is required"
        );
      }

      const { data } = await api.post(
        "/auth/reset-password",
        {
          reset_token: finalResetToken,
          new_password: finalPassword,
        }
      );

      return data;
    } catch (error) {
      const message = getErrorMessage(
        error,
        "Failed to reset password"
      );

      set({
        error: message,
      });

      throw error;
    } finally {
      set({
        loading: false,
      });
    }
  },

  /*
  |--------------------------------------------------------------------------
  | CHANGE PASSWORD - REQUEST OTP
  |--------------------------------------------------------------------------
  |
  | Authenticated user requests OTP.
  |
  */

  requestChangePasswordOtp: async () => {
    set({
      loading: true,
      error: null,
    });

    try {
      const { data } = await api.post(
        "/auth/change-password/request-otp"
      );

      return data;
    } catch (error) {
      const message = getErrorMessage(
        error,
        "Failed to send password change OTP"
      );

      set({
        error: message,
      });

      throw error;
    } finally {
      set({
        loading: false,
      });
    }
  },

  /*
  |--------------------------------------------------------------------------
  | CHANGE PASSWORD - VERIFY OTP
  |--------------------------------------------------------------------------
  |
  | OTP -> change_token
  |
  */

  verifyChangePasswordOtp: async (otp) => {
    set({
      loading: true,
      error: null,
    });

    try {
      const { data } = await api.post(
        "/auth/change-password/verify-otp",
        {
          otp: String(otp).trim(),
        }
      );

      return data;
    } catch (error) {
      const message = getErrorMessage(
        error,
        "Invalid or expired password change OTP"
      );

      set({
        error: message,
      });

      throw error;
    } finally {
      set({
        loading: false,
      });
    }
  },

  /*
  |--------------------------------------------------------------------------
  | CHANGE PASSWORD - RESEND OTP
  |--------------------------------------------------------------------------
  */

  resendChangePasswordOtp: async () => {
    set({
      loading: true,
      error: null,
    });

    try {
      const { data } = await api.post(
        "/auth/change-password/resend-otp"
      );

      return data;
    } catch (error) {
      const message = getErrorMessage(
        error,
        "Could not resend password change OTP"
      );

      set({
        error: message,
      });

      throw error;
    } finally {
      set({
        loading: false,
      });
    }
  },

  /*
  |--------------------------------------------------------------------------
  | CHANGE PASSWORD
  |--------------------------------------------------------------------------
  |
  | Backend expects:
  | {
  |   change_token,
  |   new_password
  | }
  |
  */

  changePassword: async ({
    change_token,
    new_password,
  }) => {
    set({
      loading: true,
      error: null,
    });

    try {
      const { data } = await api.post(
        "/auth/change-password",
        {
          change_token,
          new_password,
        }
      );

      return data;
    } catch (error) {
      const message = getErrorMessage(
        error,
        "Failed to change password"
      );

      set({
        error: message,
      });

      throw error;
    } finally {
      set({
        loading: false,
      });
    }
  },

  /*
  |--------------------------------------------------------------------------
  | LEGACY EMAIL VERIFICATION
  |--------------------------------------------------------------------------
  |
  | Kept because the existing frontend still contains VerifyEmail.jsx.
  |
  */

  verifyEmail: async (token) => {
    set({
      loading: true,
      error: null,
    });

    try {
      const { data } = await api.post(
        "/auth/verify-email",
        {
          token,
        }
      );

      return data;
    } catch (error) {
      const message = getErrorMessage(
        error,
        "Failed to verify email"
      );

      set({
        error: message,
      });

      throw error;
    } finally {
      set({
        loading: false,
      });
    }
  },

  /*
  |--------------------------------------------------------------------------
  | LEGACY RESEND EMAIL VERIFICATION
  |--------------------------------------------------------------------------
  */

  resendVerification: async (email) => {
    set({
      loading: true,
      error: null,
    });

    try {
      const { data } = await api.post(
        "/auth/resend-verification",
        {
          email,
        }
      );

      return data;
    } catch (error) {
      const message = getErrorMessage(
        error,
        "Failed to resend verification email"
      );

      set({
        error: message,
      });

      throw error;
    } finally {
      set({
        loading: false,
      });
    }
  },
}));

/*
|--------------------------------------------------------------------------
| GLOBAL 401 HANDLER
|--------------------------------------------------------------------------
|
| A 401 can mean:
|
| 1. The JWT/session is actually invalid.
| 2. The current endpoint rejected the request.
|
| We verify the session through /auth/me before logging the user out.
|
*/

let sessionCheck = null;

setUnauthorizedHandler(() => {
  const state = useAuthStore.getState();

  if (!state.token && !state.user) {
    return;
  }

  /*
  | Prevent multiple simultaneous /auth/me calls
  | when several API requests receive 401 together.
  */

  if (sessionCheck) {
    return;
  }

  sessionCheck = api
    .get("/auth/me", {
      [SKIP_AUTH_CHECK]: true,
    })
    .then(({ data }) => {
      /*
      | Token is still valid.
      | The previous 401 was specific to that endpoint.
      */

      useAuthStore.setState({
        user: data,
        error: null,
      });
    })
    .catch((error) => {
      /*
      | Only clear authentication when /auth/me itself
      | confirms that the session is invalid.
      */

      if (error.response?.status === 401) {
        useAuthStore.getState().clearAuth();
      }
    })
    .finally(() => {
      sessionCheck = null;
    });
});
