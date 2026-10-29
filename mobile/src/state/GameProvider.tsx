import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { ToastMessage, ToastVariant } from "@/src/components/ui/ToastMessage";
import { deviceKV } from "@/src/save/deviceKV";
import { bankRun as bankRunPure, BankOutcome, RunResult } from "@/src/save/economy";
import { corruptSave, LoadStatus, loadSave, writeSave } from "@/src/save/saveManager";
import { defaultSave, SaveData, SaveSettings } from "@/src/save/schema";
import { audio } from "@/src/services/audio";
import { haptics } from "@/src/services/haptics";

interface ToastState {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface GameCtx {
  ready: boolean;
  save: SaveData;
  init: () => Promise<LoadStatus>;
  updateSettings: (patch: Partial<SaveSettings>) => void;
  bankRun: (run: RunResult) => BankOutcome;
  showToast: (message: string, variant?: ToastVariant) => void;
  devCorruptSave: () => Promise<void>;
}

const Ctx = createContext<GameCtx | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [save, setSave] = useState<SaveData>(defaultSave);
  const saveRef = useRef<SaveData>(save);
  const writeChain = useRef<Promise<unknown>>(Promise.resolve());
  const [toast, setToast] = useState<ToastState | null>(null);

  const commit = useCallback((next: SaveData) => {
    saveRef.current = next;
    setSave(next);
    writeChain.current = writeChain.current.then(() => writeSave(deviceKV, next)).catch(() => false);
  }, []);

  const init = useCallback(async () => {
    setReady(false);
    const { data, status } = await loadSave(deviceKV);
    saveRef.current = data;
    setSave(data);
    setReady(true);
    return status;
  }, []);

  const updateSettings = useCallback(
    (patch: Partial<SaveSettings>) => commit({ ...saveRef.current, settings: { ...saveRef.current.settings, ...patch } }),
    [commit],
  );

  // Synchronous on the ref so two quick calls can never double-credit.
  const bankRun = useCallback(
    (run: RunResult) => {
      const outcome = bankRunPure(saveRef.current, run);
      if (outcome.banked) commit(outcome.save);
      return outcome;
    },
    [commit],
  );

  const showToast = useCallback((message: string, variant: ToastVariant = "info") => {
    setToast({ id: Date.now(), message, variant });
  }, []);

  const devCorruptSave = useCallback(async () => {
    if (!__DEV__) return;
    await writeChain.current;
    await corruptSave(deviceKV);
  }, []);

  useEffect(() => {
    audio.enabled = save.settings.sound;
    haptics.enabled = save.settings.vibration;
  }, [save.settings.sound, save.settings.vibration]);

  const value = useMemo(
    () => ({ ready, save, init, updateSettings, bankRun, showToast, devCorruptSave }),
    [ready, save, init, updateSettings, bankRun, showToast, devCorruptSave],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {toast ? <ToastMessage key={toast.id} message={toast.message} variant={toast.variant} onHide={() => setToast(null)} /> : null}
    </Ctx.Provider>
  );
}

export function useGame(): GameCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useGame must be used inside GameProvider");
  return c;
}
