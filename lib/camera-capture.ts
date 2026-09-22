"use client";

export function isIosCameraDevice() {
  if (typeof navigator === "undefined") return false;

  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export async function normalizeCapturedImage(
  source: File,
  outputName: string,
) {
  if (!source.type.startsWith("image/")) {
    throw new Error("A foto precisa ser uma imagem.");
  }

  const objectUrl = URL.createObjectURL(source);

  try {
    const image = new Image();

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Não foi possível ler a foto capturada."));
      image.src = objectUrl;
    });

    const maxSide = 1600;
    const scale = Math.min(
      1,
      maxSide / Math.max(image.naturalWidth || 1, image.naturalHeight || 1),
    );

    const width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
    const height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Não foi possível preparar a foto capturada.");
    }

    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.9);
    });

    if (!blob) {
      throw new Error("Não foi possível converter a foto capturada.");
    }

    return {
      file: new File([blob], outputName, {
        type: "image/jpeg",
        lastModified: Date.now(),
      }),
      preview: canvas.toDataURL("image/jpeg", 0.86),
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
