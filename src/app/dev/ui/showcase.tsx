"use client";

import { Logo } from "@/components/brand/Logo";
import { Badge } from "@/components/core/Badge";
import { Button } from "@/components/core/Button";
import { Card } from "@/components/core/Card";
import { Checkbox } from "@/components/core/Checkbox";
import { Dialog, DialogClose } from "@/components/core/Dialog";
import { Input } from "@/components/core/Input";
import { SectionLabel } from "@/components/core/SectionLabel";
import { Select } from "@/components/core/Select";
import { Tabs } from "@/components/core/Tabs";
import { useToast } from "@/components/core/Toast";
import { FichaTecnica } from "@/components/kitchen/FichaTecnica";
import { FollowUpAlert } from "@/components/kitchen/FollowUpAlert";
import { OrderRow } from "@/components/kitchen/OrderRow";
import { WhatsAppOffer } from "@/components/kitchen/WhatsAppOffer";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 48 }}>
      <SectionLabel>{title}</SectionLabel>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          marginTop: 16,
          alignItems: "flex-start",
        }}
      >
        {children}
      </div>
    </section>
  );
}

export function Showcase() {
  const toast = useToast();
  return (
    <main style={{ maxWidth: 1240, margin: "0 auto", padding: "48px 24px" }}>
      <h1
        style={{
          fontSize: "var(--text-h1)",
          lineHeight: "var(--lh-h1)",
          letterSpacing: "var(--ls-h1)",
        }}
      >
        Componentes
      </h1>
      <p style={{ color: "var(--fg-2)" }}>Página de desenvolvimento. Não existe em produção.</p>

      <Section title="Logo">
        <Logo />
        <Logo variant="symbol" size={56} />
        <Logo variant="avatar" size={56} tone="dark" />
        <Logo variant="app" size={56} tone="dark" />
        <div
          style={{
            background: "var(--surface-inverse)",
            padding: 16,
            borderRadius: "var(--radius-md)",
          }}
        >
          <Logo tone="dark" />
        </div>
      </Section>

      <Section title="Button">
        <Button>Primário</Button>
        <Button variant="dark">Escuro</Button>
        <Button variant="secondary">Secundário</Button>
        <Button variant="ghost">Ghost</Button>
        <Button disabled>Desabilitado</Button>
        <Button size="sm">Pequeno</Button>
        <Button size="lg">Grande</Button>
        <div
          style={{
            background: "var(--surface-inverse)",
            padding: 16,
            display: "flex",
            gap: 8,
            borderRadius: "var(--radius-md)",
          }}
        >
          <Button variant="secondary" onDark>
            Secundário no escuro
          </Button>
          <Button variant="ghost" onDark>
            Ghost no escuro
          </Button>
        </div>
      </Section>

      <Section title="Badge">
        <Badge>brasa</Badge>
        <Badge tone="success">success</Badge>
        <Badge tone="success-soft">success-soft</Badge>
        <Badge tone="neutral">neutral</Badge>
        <Badge tone="outline">outline</Badge>
        <Badge tone="inverse">inverse</Badge>
        <Badge mono>03:12</Badge>
      </Section>

      <Section title="Card">
        <Card style={{ width: 220 }}>Superfície</Card>
        <Card tone="inverse" style={{ width: 220 }}>
          Inverse
        </Card>
        <Card tone="dashed" style={{ width: 220 }}>
          Tracejado
        </Card>
        <Card tone="page" elevated style={{ width: 220 }}>
          Elevado
        </Card>
      </Section>

      <Section title="Input">
        <Input label="Nome" placeholder="Restaurante Cultura" hint="Como aparece na mensagem" />
        <Input label="Preço" prefix="R$" suffix="kg" numeric defaultValue="19,39" />
        <Input label="Telefone" error="Telefone inválido" defaultValue="996123757" />
      </Section>

      <Section title="Select, Checkbox, Tabs">
        <Select
          label="Segmento"
          options={[
            { value: "lanches", label: "Lanches" },
            { value: "pizzaria", label: "Pizzaria" },
            { value: "panificacao", label: "Panificação" },
          ]}
        />
        <Checkbox label="Cliente bloqueado" />
        <Checkbox label="Marcado" defaultChecked />
        <div style={{ width: 360 }}>
          <Tabs
            items={[
              { value: "a", label: "Ficha", content: "Conteúdo da ficha" },
              { value: "b", label: "Histórico", content: "Conteúdo do histórico" },
            ]}
          />
        </div>
      </Section>

      <Section title="Dialog, Toast">
        <Dialog
          trigger={<Button variant="secondary">Abrir diálogo</Button>}
          title="Confirmar importação"
          description="As linhas aceitas serão gravadas nas tabelas finais."
          footer={
            <>
              <DialogClose asChild>
                <Button variant="secondary">Cancelar</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button>Confirmar</Button>
              </DialogClose>
            </>
          }
        >
          Revise os avisos antes de confirmar.
        </Dialog>
        <Button
          variant="dark"
          onClick={() =>
            toast({
              title: "Importação confirmada",
              description: "242 clientes gravados.",
              tone: "success",
            })
          }
        >
          Toast de sucesso
        </Button>
        <Button
          variant="dark"
          onClick={() =>
            toast({ title: "Falha ao importar", description: "Revise o arquivo.", tone: "error" })
          }
        >
          Toast de erro
        </Button>
      </Section>

      <Section title="FichaTecnica">
        <div style={{ width: 420 }}>
          <FichaTecnica
            dish="Sanduíche Australiano Defumado"
            portions={1}
            items={[
              { name: "Pão Australiano", qty: "75 g", status: "ok" },
              { name: "Molho Grill Zafran", qty: "20 g", status: "missing" },
            ]}
            total="R$ 40,25"
            totalLabel="Sugestões"
          />
        </div>
      </Section>

      <Section title="OrderRow">
        <Card padding={0} style={{ width: 420 }}>
          <OrderRow
            client="Restaurante e Café Cultura"
            detail="Aceitou 2 itens"
            status="accepted"
            value="R$ 862,00"
          />
          <OrderRow
            client="Xis do Maurinho"
            detail="Oferta em aberto"
            status="open"
            value="R$ 134,70"
          />
          <OrderRow
            client="Padaria Central"
            detail="Sem sugestão"
            value="R$ 410,20"
            divider={false}
          />
        </Card>
      </Section>

      <Section title="FollowUpAlert">
        <div style={{ width: 380 }}>
          <FollowUpAlert
            title="O Zé abriu a oferta e não respondeu"
            body="Uma ligação rápida costuma resolver."
            remaining="03:12"
          />
        </div>
      </Section>

      <Section title="WhatsAppOffer">
        <WhatsAppOffer
          items={[
            { name: "Picles", from: "38,90", to: "33,10" },
            { name: "Maionese", from: "21,00", to: "17,85" },
          ]}
        />
      </Section>
    </main>
  );
}
