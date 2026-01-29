import { UserList } from "@/components/user-list";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-8 text-3xl font-bold">T3 Monorepo</h1>
      <UserList />
    </main>
  );
}
