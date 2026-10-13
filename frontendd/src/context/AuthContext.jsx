import { useAuthStore } from "../store/authStore";

export const AuthProvider = ({ children }) => {
    return children;
};

export const useAuth = () => {
    return useAuthStore();
};

