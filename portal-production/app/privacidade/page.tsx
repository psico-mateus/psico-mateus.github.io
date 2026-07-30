/* eslint-disable @next/next/no-html-link-for-pages */
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacidade",
  description: "Como a Área do paciente trata seus dados.",
};

export default function PrivacyPage() {
  return (
    <main className="dashboard privacy-page" id="conteudo" tabIndex={-1}>
      <a href="/">← Voltar à Área do paciente</a>
      <p className="eyebrow" style={{ marginTop: "3rem" }}>
        AVISO DE PRIVACIDADE
      </p>
      <h1 style={{ fontSize: "clamp(2.7rem,7vw,5rem)" }}>
        Seus registros, suas escolhas.
      </h1>
      <p className="lead">Versão de 29 de julho de 2026.</p>
      <section className="panel stack">
        <h2>O que este espaço guarda</h2>
        <p>
          Ao criar uma conta, são guardados um identificador técnico do seu
          e-mail, seu nome de preferência, credenciais protegidas e os registros
          que você escrever. O e-mail não é armazenado em texto legível.
        </p>
        <h2>Para que os dados são usados</h2>
        <p>
          Os dados servem para manter seu acesso, organizar seu histórico e
          permitir que você compartilhe registros específicos com Mateus Ribeiro
          Marcos. Eles não são usados para publicidade, venda de dados, diagnóstico
          automático ou treinamento de inteligência artificial. As quantidades de
          registros privados e compartilhados ajudam a entender se o recurso está
          sendo utilizado e se continua fazendo sentido para você, sem mostrar o
          conteúdo dos registros privados.
        </p>
        <h2>Quem pode ver</h2>
        <p>
          Cada novo registro nasce privado. Mateus só vê o conteúdo quando você
          escolhe “Compartilhar com Mateus”. Você pode retirar esse compartilhamento
          depois. No painel profissional, ele pode ver quantos registros de cada
          paciente estão compartilhados ou privados, mas não vê título, emoção,
          data nem qualquer parte do conteúdo dos privados. O texto continua
          pertencendo a você e não pode ser editado no acesso profissional. Quando
          Mateus conclui deliberadamente a visualização de um registro compartilhado,
          o portal guarda a data dessa confirmação. Essa informação também aparece
          para você no próprio registro e não significa resposta ou acompanhamento
          em tempo real.
        </p>
        <h2>Conteúdos de apoio e buscas</h2>
        <p>
          A área “Leitura complementar” reúne materiais de psicoeducação. O portal
          não guarda quais conteúdos você abriu, as palavras que pesquisou nem
          os filtros que utilizou. Essas informações não aparecem no painel
          profissional e não entram na cópia dos seus dados.
        </p>
        <h2>Onde e por quanto tempo</h2>
        <p>
          Os dados são processados em infraestrutura de nuvem, que pode envolver
          armazenamento fora do Brasil. A conta e os registros permanecem enquanto
          você mantiver a conta. Logs técnicos sem o conteúdo clínico são mantidos
          por até 180 dias.
        </p>
        <h2>Seus controles</h2>
        <p>
          Na área “Conta e privacidade”, você pode baixar uma cópia dos registros,
          alterar sua senha, gerar novo código de recuperação, encerrar a conta em
          todos os dispositivos e excluir permanentemente sua conta e seus registros.
          Se você perder a senha e o código de recuperação, pode pedir a Mateus uma
          recuperação assistida. O novo código temporário substitui o anterior e
          encerra as sessões abertas da conta.
        </p>
        <h2>Quando o acompanhamento ou o acesso termina</h2>
        <p>
          O acesso à Área do paciente pode ser desativado quando o acompanhamento
          termina. Isso encerra as sessões abertas e impede novas entradas, mas não
          apaga automaticamente a conta nem os registros. Com o vínculo encerrado,
          Mateus deixa de acessar também os registros que estavam compartilhados.
          Para pedir uma cópia ou a exclusão dos dados depois da desativação, use os
          meios de contato indicados abaixo.
        </p>
        <h2>Como exercer seus direitos</h2>
        <p>
          Além dos controles disponíveis na própria conta, você pode pedir
          confirmação sobre o tratamento dos dados, acesso, correção das informações
          de identificação ou exclusão dos dados da Área do paciente. Entre em
          contato pelos meios disponíveis no site profissional e informe que o
          pedido é sobre a Área do paciente. Para evitar que dados sejam entregues ou
          alterados para outra pessoa, Mateus poderá confirmar sua identidade antes
          de atender ao pedido.
        </p>
        <h2>Limites importantes</h2>
        <p>
          Este recurso é destinado a maiores de 18 anos e não é acompanhado em
          tempo real. Ele não substitui atendimento de urgência, prontuário clínico
          ou contato direto com o profissional.
        </p>
        <h2>Contato</h2>
        <p>
          Para dúvidas sobre este espaço ou sobre seus dados, use os meios de
          contato disponíveis no{" "}
          <a href="https://psico-mateus.github.io/">site profissional</a>.
        </p>
      </section>
    </main>
  );
}
