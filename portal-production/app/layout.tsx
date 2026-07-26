import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#242423",
};

export const metadata: Metadata = {
  title: {
    default: "Área do paciente | Mateus Ribeiro Marcos",
    template: "%s | Área do paciente",
  },
  description:
    "Um espaço privado com registros e materiais de apoio que complementam a psicoterapia.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  applicationName: "Área do paciente",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Área do paciente",
  },
  openGraph: {
    title: "Área do paciente",
    description: "Registros privados e materiais de apoio que complementam a psicoterapia.",
    type: "website",
    images: [{
      url: "https://psico-mateus.github.io/assets/images/social-preview-registros.png",
      width: 1672,
      height: 941,
      alt: "Caderno verde e caneta sobre fundo claro",
    }],
  },
  icons: {
    icon: "/icon-192.png",
    shortcut: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
