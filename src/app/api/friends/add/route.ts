import { fetchRedis } from '@/helpers/redis';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { pusherServer } from '@/lib/pusher';
import { toPusherKey } from '@/lib/utils';
import { addFriendValidator } from '@/lib/validations/add-friend';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { email: emailToAdd } = addFriendValidator.parse(body.email);
    // METHOD 1
    // const RESTResponse = await fetch(
    //   `${process.env.UPSTASH_REDIS_REST_URL}/get/user:email:${emailToAdd}`,
    //   {
    //     headers: {
    //       Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
    //     },
    //     cache: 'no-store',
    //   }
    // );

    // const data = (await RESTResponse.json()) as { result: string | null };
    // const idToAdd = data.result;

    // METHOD 2
    const idToAdd = (await fetchRedis(
      'get',
      `user:email:${emailToAdd}`
    )) as string;

    if (idToAdd === null) {
      return new Response('This email does not exist.', { status: 400 });
    }

    const session = await getServerSession(authOptions);

    if (!session) {
      return new Response('Unauthorized', { status: 401 });
    }

    if (idToAdd === session.user.id) {
      return new Response('We love you but try adding someone else.', {
        status: 400,
      });
    }

    // check if user is already added
    const isAlreadyAdded = (await fetchRedis(
      'sismember',
      `user:${idToAdd}:incoming_friend_requests`,
      session.user.id
    )) as 0 | 1;

    if (isAlreadyAdded) {
      return new Response('This user has received your friend request!', {
        status: 400,
      });
    }

    // check if user is already friends
    const isAlreadyFriends = (await fetchRedis(
      'sismember',
      `user:${session.user.id}:friends`,
      idToAdd
    )) as 0 | 1;

    if (isAlreadyFriends) {
      return new Response('Already friends with  this user', { status: 400 });
    }

    // valid request, sent friend request
    await pusherServer.trigger(
      toPusherKey(`user:${idToAdd}:incoming_friend_requests`),
      'incoming_friend_requests',
      {
        senderId: session.user.id,
        senderImage: session.user.image,
        senderName: session.user.name,
        senderEmail: session.user.email,
      }
    );

    db.sadd(`user:${idToAdd}:incoming_friend_requests`, session.user.id);

    return new Response('OK');
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response('Invalid request payload', { status: 422 });
    }

    return new Response('Invalid request', { status: 400 });
  }
}
