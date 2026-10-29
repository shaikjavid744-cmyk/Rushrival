import React from "react";

import { PrimaryButton, PrimaryButtonProps } from "./PrimaryButton";

/** Navy lipped button for secondary actions (Cancel, Home...). */
export function SecondaryButton(props: Omit<PrimaryButtonProps, "variant">) {
  return <PrimaryButton {...props} variant="navy" />;
}
