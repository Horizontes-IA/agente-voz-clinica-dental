import { test, expect } from "@playwright/test";
import fs from "node:fs";
test("dashboard, navigation, editor, agenda and responsive layout", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Qué gusto verte." }),
  ).toBeVisible();
  await page
    .getByLabel("Contraseña de administración")
    .fill(fs.readFileSync(".secrets/admin-password.txt", "utf8").trim());
  await page.getByRole("button", { name: "Entrar al dashboard" }).click();
  await expect(
    page.getByRole("heading", { name: "Tu clínica, en sintonía." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await page
    .locator("nav")
    .getByRole("button", { name: "Agenda", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Agenda de la clínica" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "7 días", exact: true }).click();
  await expect(page.locator(".week-day")).toHaveCount(7);
  await page
    .locator("nav")
    .getByRole("button", { name: "Pacientes", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Tus pacientes" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Buscar por nombre, teléfono o correo…" })
    .fill("Mariana");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Ver a Mariana García" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.getByRole('button',{name:'Nuevo paciente',exact:true}).click();
  const name=page.getByRole('dialog').getByLabel('Nombre completo');
  await name.pressSequentially('Paciente de prueba');
  await expect(name).toHaveValue('Paciente de prueba');
  await expect(name).toBeFocused();
  await page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Conocimiento", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Conocimiento con propósito" }),
  ).toBeVisible();
  await expect(page.getByLabel("Contenido del documento")).not.toBeEmpty();
  const text = await page.getByLabel("Contenido del documento").inputValue();
  await page.getByLabel("Contenido del documento").fill(text + "\n");
  await expect(
    page.getByRole("button", { name: "Guardar borrador" }),
  ).toBeEnabled();
  await page.getByLabel("Contenido del documento").fill(text);
  await page.screenshot({
    path: "test-results/knowledge-desktop.png",
    fullPage: true,
  });
  await page
    .locator("nav")
    .getByRole("button", { name: "Agente de voz" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Conoce a tu agente" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Voz y conversación", exact: true })
    .click();
  await expect(page.getByText("Una voz que inspira confianza")).toBeVisible();
  await page.screenshot({
    path: "test-results/agent-desktop.png",
    fullPage: true,
  });
  await page
    .locator("nav")
    .getByRole("button", { name: "Conversaciones", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Cada conversación cuenta" }),
  ).toBeVisible();
  await page
    .locator("nav")
    .getByRole("button", { name: "Resumen", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Tu clínica, en sintonía." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
