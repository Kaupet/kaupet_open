// kaupet_open: one display name, without private name details.
import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProfileName } from "@/lib/profile-name";

export function ProfileNameFields() {
  const {
    register,
    formState: { errors },
  } = useFormContext<ProfileName>();
  return (
    <div className="space-y-1.5">
      <Label htmlFor="display-name">Visningsnavn</Label>
      <Input
        id="display-name"
        autoComplete="name"
        aria-invalid={!!errors.firstName}
        aria-describedby={errors.firstName ? "display-name-error" : undefined}
        {...register("firstName")}
      />
      {errors.firstName && (
        <p id="display-name-error" className="text-sm text-destructive">
          {errors.firstName.message}
        </p>
      )}
    </div>
  );
}
