import { expect, test } from "@playwright/test";
import { E2E_ORDER_NUMBER, E2E_USER } from "./global-setup";

test("login, ver sugestões, editar a mensagem, copiar e registrar o resultado", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.goto("/pedidos");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("E-mail").fill(E2E_USER.email);
  await page.getByLabel("Senha").fill(E2E_USER.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Pedidos" })).toBeVisible();

  await page
    .getByRole("link", { name: new RegExp(E2E_ORDER_NUMBER) })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Cafe Cultura" })).toBeVisible();

  // duas sugestões na ficha: molho em oferta e presunto sugerido
  await expect(page.getByText("+ oferta")).toHaveCount(1);
  await expect(page.getByText("+ sugerido")).toHaveCount(1);
  await expect(page.getByText("Molho Grill Zafran 1,01kg").first()).toBeVisible();
  await expect(page.getByText("Presunto Cozido Fatiado 1kg").first()).toBeVisible();

  // editar a mensagem e salvar
  const box = page.getByLabel("Texto da mensagem");
  const original = await box.inputValue();
  expect(original).toContain("faltou Molho Grill Zafran 1,01kg: R$ 35,90/un");
  await box.fill(`${original}\nPosso entregar amanhã.`);
  await page.getByRole("button", { name: "Salvar edição" }).click();
  await expect(page.getByText("Edição salva.")).toBeVisible();

  // copiar leva o texto editado
  await page.getByRole("button", { name: "Copiar" }).click();
  await expect(page.getByRole("button", { name: "Copiado" })).toBeVisible();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain("Posso entregar amanhã.");

  // o link do WhatsApp usa o telefone e o texto atual
  const href = await page.getByRole("link", { name: "Abrir no WhatsApp" }).getAttribute("href");
  expect(href).toContain("https://wa.me/5554999314042?text=");
  expect(decodeURIComponent(href!)).toContain("Posso entregar amanhã.");

  // a edição sobrevive ao recarregar
  await page.reload();
  await expect(page.getByLabel("Texto da mensagem")).toHaveValue(/Posso entregar amanhã\./);

  // registrar "aceitou"
  await page.getByLabel("Resultado").selectOption("accepted");
  await page.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByText("Resultado registrado.")).toBeVisible();
  await expect(page.getByText("Resultados registrados")).toBeVisible();

  // o painel conta 1 mensagem enviada e 1 aceite
  await page.goto("/painel");
  await expect(page.getByTestId("metric-Aceites")).toHaveText("1");
  await expect(page.getByTestId("metric-Mensagens enviadas")).toHaveText("1");
  await expect(page.getByTestId("metric-Taxa de aceite")).toHaveText("100%");
});
