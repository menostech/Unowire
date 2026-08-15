import { notFound } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/adminApi';
import { PostForm } from '@/components/admin/form/PostForm';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditPostPage({ params }: PageProps) {
  const { id } = await params;
  const [post, allCategories] = await Promise.all([
    adminApi.posts.getById(id),
    adminApi.postCategories.all(),
  ]);
  if (!post) notFound();

  const categories = allCategories.map((c) => ({
    id: c.id,
    label: c.label,
  }));

  return (
    <div>
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/admin/posts" className="hover:underline">
          Posts
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">{post.title}</span>
      </nav>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Edit Post</h1>
      <PostForm initial={post} categories={categories} />
    </div>
  );
}
