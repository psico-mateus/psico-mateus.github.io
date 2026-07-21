import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Registros entre sessões | Mateus Ribeiro Marcos",
    template: "%s | Registros entre sessões",
  },
  description:
    "Um espaço privado para organizar situações, pensamentos e emoções e escolher o que levar para a sessão.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  applicationName: "Registros entre sessões",
  openGraph: {
    title: "Registros entre sessões",
    description: "Você guarda. Você escolhe o que compartilhar.",
    type: "website",
    images: [{
      url: "https://psico-mateus.github.io/assets/images/social-preview-registros.png",
      width: 1672,
      height: 941,
      alt: "Caderno verde e caneta sobre fundo claro",
    }],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
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
