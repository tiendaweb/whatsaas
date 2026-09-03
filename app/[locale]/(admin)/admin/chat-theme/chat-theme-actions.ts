'use server';

import { db } from '@/lib/db/drizzle';
import { getUser } from '@/lib/db/queries';
import { chatTheme } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

type ChatThemeActionResult = {
  success: boolean;
  message?: string;
  backgroundImageUrl?: string | null;
};

const allowedBackgroundTypes = ['solid', 'image'] as const;
const allowedImageTypes: Record<string, string> = {
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const colorPattern = /^#[0-9a-fA-F]{6}$/;
const maxImageSizeBytes = 5 * 1024 * 1024;
const locales = ['en', 'es', 'pt'];

async function assertAdmin() {
  const user = await getUser();
  if (!user || user.role !== 'admin') {
    throw new Error('Unauthorized');
  }

  return user;
}

function getStringValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function validateHexColor(value: string, label: string) {
  if (!colorPattern.test(value)) {
    return `${label} invalido. Usa formato #RRGGBB.`;
  }

  return null;
}

function revalidateChatThemePaths() {
  revalidatePath('/admin/chat-theme');
  revalidatePath('/api/chat-theme');

  for (const locale of locales) {
    revalidatePath(`/${locale}/admin/chat-theme`);
    revalidatePath(`/${locale}/dashboard`, 'layout');
  }
}

export async function updateChatTheme(formData: FormData) {
  try {
    await assertAdmin();

    const backgroundType = getStringValue(formData, 'backgroundType');
    const backgroundColor = getStringValue(formData, 'backgroundColor');
    const userBubbleColor = getStringValue(formData, 'userBubbleColor');
    const contactBubbleColor = getStringValue(formData, 'contactBubbleColor');
    const darkBackgroundColor = getStringValue(formData, 'darkBackgroundColor');
    const darkUserBubbleColor = getStringValue(formData, 'darkUserBubbleColor');
    const darkContactBubbleColor = getStringValue(formData, 'darkContactBubbleColor');
    const backgroundImage = formData.get('backgroundImage');

    if (!allowedBackgroundTypes.includes(backgroundType as (typeof allowedBackgroundTypes)[number])) {
      return { success: false, message: 'Tipo de fondo invalido.' } satisfies ChatThemeActionResult;
    }

    const colorError =
      validateHexColor(backgroundColor, 'Color de fondo') ||
      validateHexColor(userBubbleColor, 'Color de burbuja del usuario') ||
      validateHexColor(contactBubbleColor, 'Color de burbuja del contacto') ||
      validateHexColor(darkBackgroundColor, 'Color de fondo oscuro') ||
      validateHexColor(darkUserBubbleColor, 'Color oscuro de burbuja del usuario') ||
      validateHexColor(darkContactBubbleColor, 'Color oscuro de burbuja del contacto');

    if (colorError) {
      return { success: false, message: colorError } satisfies ChatThemeActionResult;
    }

    const uploadDir = join(process.cwd(), 'public/uploads/chat-theme');
    await mkdir(uploadDir, { recursive: true });

    let backgroundImageUrl = '';
    if (backgroundImage instanceof File && backgroundImage.size > 0) {
      const extension = allowedImageTypes[backgroundImage.type];

      if (!extension) {
        return { success: false, message: 'Formato de imagen no permitido.' } satisfies ChatThemeActionResult;
      }

      if (backgroundImage.size > maxImageSizeBytes) {
        return { success: false, message: 'La imagen no puede superar 5 MB.' } satisfies ChatThemeActionResult;
      }

      const bytes = await backgroundImage.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const filename = `${Date.now()}-${randomUUID()}.${extension}`;
      const path = join(uploadDir, filename);
      await writeFile(path, buffer);
      backgroundImageUrl = `/uploads/chat-theme/${filename}`;
    }

    const current = await db.query.chatTheme.findFirst();

    const data = {
      backgroundType,
      backgroundColor,
      userBubbleColor,
      contactBubbleColor,
      darkBackgroundColor,
      darkUserBubbleColor,
      darkContactBubbleColor,
      backgroundImageUrl: backgroundImageUrl || (current?.backgroundImageUrl ?? null),
      updatedAt: new Date(),
    };

    if (current) {
      await db.update(chatTheme).set(data).where(eq(chatTheme.id, current.id));
    } else {
      await db.insert(chatTheme).values({
        ...data,
        backgroundImageUrl: backgroundImageUrl || null,
      });
    }

    revalidateChatThemePaths();

    return { success: true, backgroundImageUrl: data.backgroundImageUrl } satisfies ChatThemeActionResult;
  } catch (error) {
    console.error(error);
    return { success: false, message: 'No se pudo actualizar el tema del chat.' } satisfies ChatThemeActionResult;
  }
}

export async function removeBackgroundImage() {
  try {
    await assertAdmin();

    const current = await db.query.chatTheme.findFirst();
    if (current) {
      await db.update(chatTheme).set({
        backgroundImageUrl: null,
        backgroundType: 'solid',
        updatedAt: new Date(),
      }).where(eq(chatTheme.id, current.id));
    }

    revalidateChatThemePaths();

    return { success: true, backgroundImageUrl: null } satisfies ChatThemeActionResult;
  } catch (error) {
    console.error(error);
    return { success: false, message: 'No se pudo eliminar la imagen de fondo.' } satisfies ChatThemeActionResult;
  }
}
