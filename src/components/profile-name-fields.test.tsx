// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { profileNameSchema, type ProfileName } from "@/lib/profile-name";
import { ProfileNameFields } from "./profile-name-fields";

afterEach(cleanup);

function Form() {
  const form = useForm<ProfileName>({
    resolver: zodResolver(profileNameSchema),
    defaultValues: { firstName: "", lastName: "", showLastName: false },
  });
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(() => {})} noValidate>
        <ProfileNameFields />
        <button>Lagre</button>
      </form>
    </FormProvider>
  );
}

it("viser bare visningsnavn og kobler valideringsfeil til feltet", async () => {
  const user = userEvent.setup();
  render(<Form />);
  const input = screen.getByRole("textbox", { name: "Visningsnavn" });
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  expect(screen.queryByRole("checkbox")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Lagre" }));
  await waitFor(() => expect(input.getAttribute("aria-invalid")).toBe("true"));
  expect(input.getAttribute("aria-describedby")).toBe("display-name-error");
  await user.type(input, "Kari");
  await user.click(screen.getByRole("button", { name: "Lagre" }));
  await waitFor(() => expect(input.getAttribute("aria-invalid")).toBe("false"));
});
