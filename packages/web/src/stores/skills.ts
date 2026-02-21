import { create } from "zustand";

export interface SkillMeta {
  name: string;
  description: string;
  enabled: boolean;
}

interface SkillsState {
  skills: SkillMeta[];
  /** Currently active skill (if a skill is being executed) */
  activeSkill: { skill: string; label: string } | null;

  // Actions
  setSkills: (skills: SkillMeta[]) => void;
  setActiveSkill: (skill: string, label: string) => void;
  clearActiveSkill: () => void;
}

export const useSkillsStore = create<SkillsState>((set) => ({
  skills: [],
  activeSkill: null,

  setSkills: (skills) => set({ skills }),

  setActiveSkill: (skill, label) =>
    set({ activeSkill: { skill, label } }),

  clearActiveSkill: () => set({ activeSkill: null }),
}));
