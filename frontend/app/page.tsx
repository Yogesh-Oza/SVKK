import { redirect } from "next/navigation";

// Redirect to leads - middleware will handle authentication
export default function Home() {
  redirect("/leads");
}
