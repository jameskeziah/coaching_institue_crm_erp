import { expect, test } from '@playwright/test';

const apiBase = process.env.API_BASE || 'http://127.0.0.1:4000/api';
const adminUsername = process.env.SMOKE_USERNAME || process.env.ADMIN_USERNAME || 'admin';
const adminPassword = process.env.SMOKE_PASSWORD || process.env.ADMIN_PASSWORD || 'MirakuAdmin2026!';

async function loginThroughUi(page, username = adminUsername, password = adminPassword) {
  await page.goto('/dashboard');
  await page.getByPlaceholder('Username').fill(username);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(`Signed in: ${username}`)).toBeVisible();

  const retry = page.getByRole('button', { name: 'Retry' });
  if (await retry.isVisible().catch(() => false)) {
    await retry.click();
  }

  await expect(page.getByRole('heading', { name: /Today's Institute Dashboard/i })).toBeVisible();
}

async function createRoleUser(request, role) {
  const suffix = `${Date.now()}-${Math.round(Math.random() * 100000)}`;
  const username = `ui-${role}-${suffix}`;
  const password = `UiRole${suffix}!`;

  const login = await request.post(`${apiBase}/auth/login`, {
    data: { username: adminUsername, password: adminPassword },
  });
  expect(login.ok()).toBeTruthy();
  const { token } = await login.json();

  const created = await request.post(`${apiBase}/users`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { username, password, role },
  });
  expect(created.ok()).toBeTruthy();

  return { username, password };
}

test('admin can login, view dashboard, toggle theme, and logout', async ({ page }) => {
  await loginThroughUi(page);

  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await page.getByRole('menuitem', { name: /Dark/ }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);

  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await page.getByRole('menuitem', { name: /Light/ }).click();
  await expect(page.locator('html')).toHaveClass(/light/);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('teacher role only sees teacher-allowed modules in the sidebar', async ({ page, request }) => {
  const teacher = await createRoleUser(request, 'teacher');
  await loginThroughUi(page, teacher.username, teacher.password);

  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Attendance' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Academic' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tests' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Teacher Performance' })).toBeVisible();

  await expect(page.getByRole('link', { name: 'Fees' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Expenses' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Reports' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Admissions' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Ontology' })).toHaveCount(0);
});
