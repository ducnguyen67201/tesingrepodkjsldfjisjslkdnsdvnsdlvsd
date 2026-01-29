"use client";

import { trpc } from "@/trpc/client";
import type { User } from "@t3/db";

export function UserList() {
  const { data: users, isLoading, error } = trpc.user.list.useQuery();

  if (isLoading) {
    return <div className="text-gray-500">Loading users...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error: {error.message}</div>;
  }

  if (!users || users.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
        <p className="text-gray-500">No users found.</p>
        <p className="mt-2 text-sm text-gray-400">
          Run the worker and create some users to see them here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Users</h2>
      <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
        {users.map((user: User) => (
          <li key={user.id} className="px-4 py-3">
            <p className="font-medium">{user.name ?? "Unnamed"}</p>
            <p className="text-sm text-gray-500">{user.email}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
