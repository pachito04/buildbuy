/**
 * Tests for CreatePoolDialog — GAP1 linked-active company filter (T03/T04).
 *
 * Strict TDD: these tests were written BEFORE the implementation changes.
 *
 * Strategy: CreatePoolDialog receives `linkedCompanies` (already filtered to
 * active links) instead of all companies. These tests verify presentation
 * behavior — what the user sees in the invite section.
 *
 * Zero Supabase mocks — pure component rendering tests.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CreatePoolDialog } from "../CreatePoolDialog";

// ---------------------------------------------------------------------------
// Minimal stub for DialogContent (bypasses Radix portal rendering in jsdom)
// ---------------------------------------------------------------------------

vi.mock("@/components/ui/dialog", () => ({
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (v: boolean) => void }) => (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      data-testid="shared-switch"
    />
  ),
}));

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: () => void }) => (
    <input type="checkbox" checked={checked} onChange={onCheckedChange} />
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.PropsWithChildren<React.ButtonHTMLAttributes<HTMLButtonElement>>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
}));

vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const noop = () => {};

function renderDialog(linkedCompanies: { id: string; name: string }[]) {
  return render(
    <CreatePoolDialog
      linkedCompanies={linkedCompanies}
      userCompanyId="company-mine"
      isPending={false}
      onSubmit={noop}
    />
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CreatePoolDialog — GAP1 linked-active filter", () => {
  it("shows only the active-linked company (B) and not the unlinked company (D)", async () => {
    const linkedCompanies = [{ id: "company-b", name: "Empresa B" }];

    renderDialog(linkedCompanies);

    // Reveal the company list by toggling the shared switch
    const sharedSwitch = screen.getByTestId("shared-switch");
    fireEvent.click(sharedSwitch);

    expect(screen.getByText("Empresa B")).toBeInTheDocument();
    expect(screen.queryByText("Empresa D")).not.toBeInTheDocument();
  });

  it("shows an empty-state message when there are no actively-linked companies", async () => {
    renderDialog([]);

    const sharedSwitch = screen.getByTestId("shared-switch");
    fireEvent.click(sharedSwitch);

    // The empty state message from GAP1 spec
    expect(
      screen.getByText(/no ten.s empresas vinculadas/i)
    ).toBeInTheDocument();
  });

  it("shows all N active-linked companies when multiple links are active", () => {
    const linkedCompanies = [
      { id: "company-b", name: "Empresa B" },
      { id: "company-c", name: "Empresa C" },
    ];

    renderDialog(linkedCompanies);

    const sharedSwitch = screen.getByTestId("shared-switch");
    fireEvent.click(sharedSwitch);

    expect(screen.getByText("Empresa B")).toBeInTheDocument();
    expect(screen.getByText("Empresa C")).toBeInTheDocument();
  });

  it("does NOT show the company selection section before the shared toggle is enabled", () => {
    renderDialog([{ id: "company-b", name: "Empresa B" }]);

    // Company list should not be visible before toggling shared
    expect(screen.queryByText("Empresa B")).not.toBeInTheDocument();
  });
});
