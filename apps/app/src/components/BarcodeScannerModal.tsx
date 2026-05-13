"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { useClientI18n } from "@/lib/client-i18n";

type BarcodeResult = { rawValue?: string };

export function BarcodeScannerModal(props: { open: boolean; onClose: () => void; onDetected: (code: string) => void }) {
  const { t } = useClientI18n();
  const open = props.open;
  const onClose = props.onClose;
  const onDetected = props.onDetected;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [devices, setDevices] = useState<{ deviceId: string; label: string }[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");

  const canUseDetector = useMemo(() => typeof window !== "undefined" && "BarcodeDetector" in window, []);

  useEffect(() => {
    if (!open) return;
    try {
      const saved = window.localStorage.getItem("oneerp.scan.cameraDeviceId") ?? "";
      if (saved) setDeviceId(saved);
    } catch {}
  }, [open]);

  useEffect(() => {
    if (!deviceId) return;
    try {
      window.localStorage.setItem("oneerp.scan.cameraDeviceId", deviceId);
    } catch {}
  }, [deviceId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setErrorKey(null);
    setReady(false);
    setDevices([]);

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "environment" },
          audio: false
        });
        if (cancelled) return;
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        if (cancelled) return;
        setReady(true);

        try {
          const list = await navigator.mediaDevices.enumerateDevices();
          if (!cancelled) {
            const cams = list
              .filter((d) => d.kind === "videoinput")
              .map((d, idx) => ({ deviceId: d.deviceId, label: d.label || `Camera ${idx + 1}` }));
            setDevices(cams);
            if (!deviceId) {
              const activeId = stream.getVideoTracks()[0]?.getSettings()?.deviceId ?? "";
              if (activeId) setDeviceId(activeId);
            }
          }
        } catch {}

        if (!("BarcodeDetector" in window)) {
          setErrorKey("app.shop.products.scan.notSupported");
          return;
        }

        const Detector = (window as unknown as { BarcodeDetector: new (opts?: unknown) => { detect: (src: ImageBitmapSource) => Promise<BarcodeResult[]> } })
          .BarcodeDetector;
        let detector: { detect: (src: ImageBitmapSource) => Promise<BarcodeResult[]> };
        try {
          detector = new Detector({
            formats: ["qr_code", "ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e"]
          });
        } catch {
          detector = new Detector(undefined);
        }

        const tick = async () => {
          if (cancelled) return;
          const v = videoRef.current;
          if (!v) return;
          try {
            const results = await detector.detect(v);
            const code = results?.[0]?.rawValue?.trim() ?? "";
            if (code) {
              onDetected(code);
              onClose();
              return;
            }
          } catch {}
          rafRef.current = requestAnimationFrame(() => void tick());
        };
        rafRef.current = requestAnimationFrame(() => void tick());
      } catch {
        setErrorKey("app.shop.products.scan.permissionDenied");
      }
    }

    void start();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) track.stop();
        streamRef.current = null;
      }
    };
  }, [open, onClose, onDetected, deviceId]);

  return (
    <Modal open={open} onClose={onClose}>
      <div className="p-6 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xl font-semibold">{t("app.shop.products.scan.title")}</div>
            <div className="mt-2 text-sm text-gray-700">{t("app.shop.products.scan.subtitle")}</div>
          </div>
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
            onClick={onClose}
          >
            {t("common.button.close")}
          </button>
        </div>

        {devices.length > 1 ? (
          <div className="mt-6">
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.products.scan.camera")}</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
            >
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-black">
          <video ref={videoRef} className="h-[340px] w-full object-cover" playsInline muted />
        </div>

        {!canUseDetector ? (
          <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t("app.shop.products.scan.notSupported")}</div>
        ) : null}
        {errorKey ? <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{t(errorKey)}</div> : null}
        {ready ? <div className="mt-4 text-sm text-gray-700">{t("app.shop.products.scan.hint")}</div> : null}
      </div>
    </Modal>
  );
}
