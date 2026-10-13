import { notFound } from "next/navigation";
import { Showcase } from "./showcase";

export default function DevUiPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Showcase />;
}
