import { create } from "zustand";
type SessionState = { userId?: string; onboardingComplete: boolean; setUserId: (userId: string) => void; beginOnboarding: () => void; completeOnboarding: () => void; logout: () => void };
export const useSession = create<SessionState>(set => ({ onboardingComplete: false, setUserId: userId => set({ userId }), beginOnboarding: () => set({ onboardingComplete: false }), completeOnboarding: () => set({ onboardingComplete: true }), logout: () => set({ userId: undefined, onboardingComplete: false }) }));
