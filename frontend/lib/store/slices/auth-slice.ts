import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { apiPost, backendApi, clearStoredTokens, refreshSvkkAccessToken } from "@/lib/api/svkk-client";
import { getStoredRefreshToken, setStoredTokens } from "@/lib/svkk/token-storage";
import type { SvkkUser } from "@/lib/svkk/types";
import { normalizeSvkkUser } from "@/lib/svkk/normalize-user";

export type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated";

const initialState: {
  user: SvkkUser | null;
  status: AuthStatus;
  error: string | null;
} = {
  user: null,
  status: "loading",
  error: null,
};

export const initializeAuth = createAsyncThunk("auth/initialize", async (_, { rejectWithValue }) => {
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  if (offline) {
    const { loadAuthSnapshot } = await import("@/lib/svkk/offline/auth-snapshot");
    const snapshotUser = await loadAuthSnapshot();
    if (snapshotUser) {
      return snapshotUser;
    }
    return rejectWithValue("unauthenticated");
  }
  try {
    const { data } = await backendApi.get<Record<string, unknown>>("/auth/me");
    const user = normalizeSvkkUser(data);
    const { saveAuthSnapshot } = await import("@/lib/svkk/offline/auth-snapshot");
    await saveAuthSnapshot(user);
    return user;
  } catch (e) {
    const { loadAuthSnapshot } = await import("@/lib/svkk/offline/auth-snapshot");
    const { isLikelyOfflineError } = await import("@/lib/svkk/offline/policy-data");
    if (isLikelyOfflineError(e)) {
      const snapshotUser = await loadAuthSnapshot();
      if (snapshotUser) {
        return snapshotUser;
      }
    }
    const at = await refreshSvkkAccessToken();
    if (at === null) {
      clearStoredTokens();
      return rejectWithValue("unauthenticated");
    }
    try {
      const { data } = await backendApi.get<Record<string, unknown>>("/auth/me");
      const user = normalizeSvkkUser(data);
      const { saveAuthSnapshot } = await import("@/lib/svkk/offline/auth-snapshot");
      await saveAuthSnapshot(user);
      return user;
    } catch {
      clearStoredTokens();
      return rejectWithValue("unauthenticated");
    }
  }
});

export const loginWithPassword = createAsyncThunk(
  "auth/login",
  async (args: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const body = await apiPost<{
        user: SvkkUser;
        accessToken?: string;
        refreshToken?: string;
      }>("/auth/login", {
        email: args.email,
        password: args.password,
      });
      if (body.accessToken && body.refreshToken) {
        setStoredTokens(body.accessToken, body.refreshToken);
      }
      const user = normalizeSvkkUser(body.user as Record<string, unknown>);
      const { saveAuthSnapshot } = await import("@/lib/svkk/offline/auth-snapshot");
      await saveAuthSnapshot(user);
      return user;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Login failed";
      return rejectWithValue(message);
    }
  },
);

export const logoutUser = createAsyncThunk("auth/logout", async () => {
  try {
    const rt = getStoredRefreshToken();
    await backendApi.post("/auth/logout", rt ? { refreshToken: rt } : {});
  } catch {
    /* still clear */
  } finally {
    clearStoredTokens();
  }
});

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    clearAuth(state) {
      state.user = null;
      state.status = "unauthenticated";
      state.error = null;
    },
    setSessionUser(state, action: PayloadAction<SvkkUser | null>) {
      state.user = action.payload;
      if (action.payload) {
        state.status = "authenticated";
      } else {
        state.status = "unauthenticated";
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(initializeAuth.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(initializeAuth.fulfilled, (state, action) => {
        state.user = action.payload;
        state.status = "authenticated";
      })
      .addCase(initializeAuth.rejected, (state) => {
        state.user = null;
        state.status = "unauthenticated";
      })
      .addCase(loginWithPassword.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(loginWithPassword.fulfilled, (state, action) => {
        state.user = action.payload;
        state.status = "authenticated";
      })
      .addCase(loginWithPassword.rejected, (state, action) => {
        state.error = typeof action.payload === "string" ? action.payload : "Login failed";
        if (!state.user) {
          state.status = "unauthenticated";
        } else {
          state.status = "authenticated";
        }
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
        state.status = "unauthenticated";
        state.error = null;
      });
  },
});

export const { clearAuth, setSessionUser } = authSlice.actions;
export const authReducer = authSlice.reducer;
