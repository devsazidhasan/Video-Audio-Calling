import { RtcTokenBuilder, RtcRole } from "agora-access-token";

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const channelName = searchParams.get("channelName");
        const uid = Number(searchParams.get("uid"));

        if (!channelName) return new Response(JSON.stringify({ error: "Channel name required" }), { status: 400 });
        if (!uid && uid !== 0) return new Response(JSON.stringify({ error: "UID required" }), { status: 400 });

        const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID!;
        const appCertificate = process.env.AGORA_APP_CERTIFICATE!;

        if (!appId || !appCertificate) return new Response(JSON.stringify({ error: "Missing Agora App ID / Certificate" }), { status: 500 });

        const expireTime = 3600; // 1 hour
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const privilegeExpire = currentTimestamp + expireTime;

        const token = RtcTokenBuilder.buildTokenWithUid(appId, appCertificate, channelName, uid, RtcRole.PUBLISHER, privilegeExpire);

        return new Response(JSON.stringify({ token, appId }), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (error: any) {
        console.error(error);
        return new Response(JSON.stringify({ error: "Failed to generate token" }), { status: 500 });
    }
}
