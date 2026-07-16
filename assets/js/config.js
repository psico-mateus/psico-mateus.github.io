(() => {
  const professionalLinks = {
    whatsapp: "https://wa.me/5541998548905",
    instagram: "https://www.instagram.com/psico.mateus/",
    linkedin: "https://www.linkedin.com/in/mateus-ribeiro-marcos-2439411b9/",
    email: "mailto:psico.mateus@outlook.com",
    guide: "/guia-emocoes/",
    guidePdf: "/assets/downloads/Guia_Pratico_para_Reconhecer_Emocoes.pdf",
  };

  const messages = {
    general:
      "Olá, Mateus. Encontrei seu site e gostaria de saber sobre a disponibilidade para atendimento psicológico. Tenho interesse em atendimento [on-line particular / presencial pela Unimed].",
    online:
      "Olá, Mateus. Encontrei seu site e gostaria de saber sobre a disponibilidade para atendimento psicológico on-line particular.",
    inPerson:
      "Olá, Mateus. Encontrei seu site e gostaria de saber sobre a disponibilidade para atendimento psicológico presencial pela Unimed.",
  };

  const whatsappWithMessage = (message) =>
    `${professionalLinks.whatsapp}?text=${encodeURIComponent(message)}`;

  window.SITE_CONFIG = Object.freeze({
    professionalLinks: Object.freeze(professionalLinks),
    messages: Object.freeze(messages),
    links: Object.freeze({
      generalWhatsapp: whatsappWithMessage(messages.general),
      onlineWhatsapp: whatsappWithMessage(messages.online),
      inPersonWhatsapp: whatsappWithMessage(messages.inPerson),
      instagram: professionalLinks.instagram,
      linkedin: professionalLinks.linkedin,
      email: professionalLinks.email,
      appointmentEmail:
        "mailto:psico.mateus@outlook.com?subject=Informa%C3%A7%C3%B5es%20sobre%20atendimento%20psicol%C3%B3gico",
    }),
    canonicalGuide: "https://psico-mateus.github.io/guia-emocoes/",
  });
})();
