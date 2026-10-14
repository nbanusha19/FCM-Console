import { useEffect, useRef, useState } from "react";
import { Camera, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { initials } from "@/lib/format";
import { elementToPhotoDataUrl, fileToPhotoDataUrl } from "@/lib/photo";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function VisitorPhoto({
  name,
  src,
  onCapture,
  className,
  size = "md",
  tone = "soft",
}: {
  name: string;
  src?: string | null | undefined;
  onCapture?: ((dataUrl: string) => void | Promise<void>) | undefined;
  className?: string;
  size?: "sm" | "md" | "lg";
  tone?: "soft" | "badge";
}) {
  const folderRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const frame = {
    sm: "size-11",
    md: "h-[96px] w-[80px]",
    lg: "h-[112px] w-[92px]",
  }[size];

  const applyFile = async (file: File | undefined) => {
    if (!file || !onCapture) return;
    try {
      const dataUrl = await fileToPhotoDataUrl(file);
      await onCapture(dataUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not use that photo.");
    }
  };

  const frameClassName = cn(
    "relative shrink-0 overflow-hidden rounded-xl",
    frame,
    tone === "badge" ? "bg-primary-foreground/20 ring-1 ring-primary-foreground/35" : "bg-primary-soft",
    onCapture ? "cursor-pointer" : "cursor-default",
    className,
  );

  const preview = (
    <>
      {src ? (
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        <span
          className={cn(
            "grid size-full place-items-center font-bold",
            tone === "badge" ? "text-primary-foreground" : "text-primary",
            size === "sm" ? "text-[13px]" : "text-[18px]",
          )}
        >
          {initials(name)}
        </span>
      )}
      {onCapture ? (
        <span
          className={cn(
            "absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 py-1 text-[9px] font-semibold uppercase tracking-[0.08em]",
            tone === "badge" ? "bg-black/45 text-primary-foreground" : "bg-foreground/70 text-primary-foreground",
          )}
        >
          <Camera className="size-3" /> {src ? "Change" : "Photo"}
        </span>
      ) : null}
    </>
  );

  if (!onCapture) {
    return (
      <div className={frameClassName} aria-label={`${name} photo`}>
        {preview}
      </div>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={frameClassName} aria-label={src ? "Change visitor photo" : "Add visitor photo"}>
            {preview}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="print:hidden">
          <DropdownMenuItem onSelect={() => setCameraOpen(true)}>
            <Camera className="size-4" /> Take photo
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              window.setTimeout(() => folderRef.current?.click(), 0);
            }}
          >
            <FolderOpen className="size-4" /> Choose from folder
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={folderRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void applyFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <CameraCaptureDialog
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onCapture={async (dataUrl) => {
          await onCapture(dataUrl);
          setCameraOpen(false);
        }}
        onUseFolder={() => {
          setCameraOpen(false);
          window.setTimeout(() => folderRef.current?.click(), 0);
        }}
      />
    </>
  );
}

function CameraCaptureDialog({
  open,
  onOpenChange,
  onCapture,
  onUseFolder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (dataUrl: string) => void | Promise<void>;
  onUseFolder: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError("");

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
      } catch {
        if (!cancelled) {
          setError("Camera is blocked or unavailable. Choose a photo from a folder instead.");
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      const video = videoRef.current;
      if (video) video.srcObject = null;
    };
  }, [open]);

  const snap = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      toast.error("Wait for the camera preview, then try again.");
      return;
    }
    try {
      await onCapture(elementToPhotoDataUrl(video));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not capture the photo.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="print:hidden sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Take visitor photo</DialogTitle>
          <DialogDescription>Use the camera, or switch to a file from a folder.</DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="rounded-xl bg-warning-soft px-3 py-2 text-[13px] font-medium text-warning">{error}</p>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="aspect-square w-full rounded-xl bg-muted object-cover" />
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onUseFolder}>
            <FolderOpen className="size-4" /> Choose from folder
          </Button>
          <Button type="button" onClick={() => void snap()} disabled={!!error}>
            <Camera className="size-4" /> Use this photo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
