import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hearth — Family Health Records",
    short_name: "Hearth",
    description:
      "Private family health record: upload lab reports, review extracted values, track trends.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7fbff",
    theme_color: "#13203f",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
