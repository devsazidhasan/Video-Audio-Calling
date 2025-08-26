"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaPhoneSlash, FaMicrophone, FaMicrophoneSlash, FaVideo, FaVideoSlash } from "react-icons/fa";

let AgoraRTC: any;

type RemoteTracks = {
    uid: string | number;
    videoTrack?: any | null;
    audioTrack?: any | null;
};

const CHANNEL = "global-room";

export default function CallPage() {
    const [client, setClient] = useState<any>(null);
    const [joined, setJoined] = useState(false);
    const [joining, setJoining] = useState(false);
    const [micOn, setMicOn] = useState(true);
    const [camOn, setCamOn] = useState(true);
    const [callDuration, setCallDuration] = useState(0);
    const [callType, setCallType] = useState<'video' | 'audio'>('video');

    const localVideoRef = useRef<HTMLDivElement | null>(null);
    const localMicTrackRef = useRef<any>(null);
    const localCamTrackRef = useRef<any>(null);
    const [remoteUsers, setRemoteUsers] = useState<Record<string | number, RemoteTracks>>({});
    const callTimerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        (async () => {
            const module = await import("agora-rtc-sdk-ng");
            AgoraRTC = module.default;
            const c = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
            setClient(c);
        })();
    }, []);

    useEffect(() => {
        if (joined) {
            setCallDuration(0);
            callTimerRef.current = setInterval(() => {
                setCallDuration((prev) => prev + 1);
            }, 1000);
        } else {
            if (callTimerRef.current) {
                clearInterval(callTimerRef.current);
                callTimerRef.current = null;
            }
        }
    }, [joined]);

    const formatDuration = (seconds: number) => {
        const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    };

    const upsertRemote = useCallback((uid: string | number, patch: Partial<RemoteTracks>) => {
        setRemoteUsers((prev) => ({
            ...prev,
            [uid]: { uid, videoTrack: prev[uid]?.videoTrack ?? null, audioTrack: prev[uid]?.audioTrack ?? null, ...patch },
        }));
    }, []);

    const removeRemote = useCallback((uid: string | number) => {
        setRemoteUsers((prev) => {
            const copy = { ...prev };
            delete copy[uid];
            return copy;
        });
    }, []);

    const handleJoin = useCallback(async () => {
        if (!client || joined || joining) return;
        setJoining(true);

        try {
            const tempUid = Math.floor(Math.random() * 1_000_000);
            const tokenRes = await fetch(`/api/agora-token?channelName=${CHANNEL}&uid=${tempUid}`);
            const { token, appId } = await tokenRes.json();

            if (!token || !appId) return alert("Token or App ID missing");

            await client.join(appId, CHANNEL, token, tempUid);

            const tracks = await AgoraRTC.createMicrophoneAndCameraTracks();
            localMicTrackRef.current = tracks[0];
            localCamTrackRef.current = tracks[1];

            if (camOn && localVideoRef.current && callType === 'video') tracks[1].play(localVideoRef.current);

            await client.publish(tracks);

            client.on("user-published", async (user: any, mediaType: string) => {
                await client.subscribe(user, mediaType);
                if (mediaType === "video" && user.videoTrack) upsertRemote(user.uid, { videoTrack: user.videoTrack });
                if (mediaType === "audio" && user.audioTrack) {
                    upsertRemote(user.uid, { audioTrack: user.audioTrack });
                    user.audioTrack.play();
                }
            });

            client.on("user-unpublished", (user: any, mediaType: string) => {
                if (mediaType === "video") upsertRemote(user.uid, { videoTrack: null });
                if (mediaType === "audio") upsertRemote(user.uid, { audioTrack: null });
            });

            client.on("user-left", (user: any) => removeRemote(user.uid));

            setJoined(true);
        } catch (e) {
            console.error(e);
            alert("Join failed! Check console/env vars.");
        } finally {
            setJoining(false);
        }
    }, [camOn, client, joined, joining, removeRemote, upsertRemote, callType]);

    const handleLeave = useCallback(async () => {
        [localMicTrackRef.current, localCamTrackRef.current].forEach((t) => {
            try {
                t?.stop();
                t?.close();
            } catch {}
        });
        localMicTrackRef.current = null;
        localCamTrackRef.current = null;

        await client?.unpublish();
        await client?.leave();

        setRemoteUsers({});
        setJoined(false);
        setMicOn(true);
        setCamOn(true);
    }, [client]);

    const toggleMic = useCallback(async () => {
        const track = localMicTrackRef.current;
        if (!track) return;
        const next = !micOn;
        await track.setEnabled(next);
        setMicOn(next);
    }, [micOn]);

    const toggleCam = useCallback(async () => {
        const track = localCamTrackRef.current;
        if (!track) return;
        const next = !camOn;
        await track.setEnabled(next);
        setCamOn(next);
        if (next && localVideoRef.current) track.play(localVideoRef.current);
    }, [camOn]);

    const remoteUser = useMemo(() => Object.values(remoteUsers)[0] || null, [remoteUsers]);

    const handleCallTypeChange = (type: 'video' | 'audio') => {
        if (!joined) {
            setCallType(type);
        }
    };

    if (!client) return <div className="p-4 flex items-center justify-center min-h-screen bg-gray-900 text-white">Loading Agora client...</div>;

    return (
        <div className="flex flex-col h-screen bg-gray-950 text-white p-4">
            {!joined ? (
                <div className="flex flex-col items-center justify-center flex-grow space-y-8">
                    <h1 className="text-3xl font-bold text-center">Start a Call</h1>
                    <div className="flex space-x-4">
                        <button
                            onClick={() => { handleCallTypeChange('video'); handleJoin(); }}
                            className="flex items-center space-x-2 px-6 py-3 rounded-full text-lg font-semibold transition-colors duration-300 bg-blue-600 hover:bg-blue-700"
                        >
                            <FaVideo/>
                            {joining ? "Joining..." : "Video Call"}
                        </button>

                        <button
                            onClick={() => { handleCallTypeChange('audio'); handleJoin(); }}
                            className="flex items-center space-x-2 px-6 py-3 rounded-full text-lg font-semibold transition-colors duration-300 bg-gray-700 hover:bg-gray-600"
                        >
                            <FaMicrophone/>
                            {joining ? "Joining..." : "Audio Call"}
                        </button>
                    </div>
                    {/*<button onClick={handleJoin} disabled={joining} className="px-8 py-4 rounded-full bg-green-500 text-white text-xl font-bold hover:bg-green-600 transition-colors duration-300">*/}
                    {/*    {joining ? "Joining..." : "Join Call"}*/}
                    {/*</button>*/}
                </div>
            ) : (
                <div className="relative w-full h-full flex flex-col items-center justify-center">
                    <div className="absolute top-4 left-4 right-4 flex justify-between items-center text-gray-300">
                        <h1 className="text-xl font-semibold">Live Call</h1>
                        <span className="text-xl font-mono">{formatDuration(callDuration)}</span>
                    </div>

                    <div className="flex-grow flex items-center justify-center relative w-full h-full">
                        {remoteUser && remoteUser.videoTrack && callType === 'video' ? (
                            <div className="absolute inset-0 z-0">
                                <RemoteVideo uid={remoteUser.uid} videoTrack={remoteUser.videoTrack} />
                            </div>
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center bg-gray-800 rounded-2xl">
                                <span className="text-4xl text-gray-500">No Video Available</span>
                            </div>
                        )}
                        <div className="absolute bottom-4 right-4 z-10 w-40 h-28 md:w-56 md:h-36 rounded-xl overflow-hidden shadow-lg border-2 border-white">
                            <div ref={localVideoRef} className="w-full h-full bg-black" />
                            <span className="absolute bottom-1 left-1 text-xs bg-black/50 text-white px-2 py-0.5 rounded-full">You</span>
                        </div>
                    </div>

                    <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex gap-4 bg-gray-800/80 backdrop-blur-md px-6 py-3 rounded-full shadow-lg z-20">
                        <button onClick={toggleMic} className="w-12 h-12 flex items-center justify-center rounded-full text-white transition-colors duration-300" style={{ backgroundColor: micOn ? '#4A5568' : '#F56565' }}>
                            {micOn ? <FaMicrophoneSlash size={24} /> : <FaMicrophone size={24} />}
                        </button>
                        {callType === 'video' && (
                            <button onClick={toggleCam} className="w-12 h-12 flex items-center justify-center rounded-full text-white transition-colors duration-300" style={{ backgroundColor: camOn ? '#4A5568' : '#F56565' }}>
                                {camOn ? <FaVideoSlash size={24} /> : <FaVideo size={24} />}
                            </button>
                        )}
                        <button onClick={handleLeave} className="w-12 h-12 flex items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors duration-300">
                            <FaPhoneSlash size={24} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function RemoteVideo({ uid, videoTrack }: { uid: string | number; videoTrack: any | null }) {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (videoTrack && containerRef.current) {
            videoTrack.play(containerRef.current);
            return () => {
                try { videoTrack.stop(); } catch {}
            };
        }
    }, [videoTrack]);

    return (
        <div className="w-full h-full bg-black relative">
            <div ref={containerRef} className="w-full h-full" />
            <span className="absolute left-4 top-4 text-sm px-3 py-1 bg-white/20 text-white rounded-full">Remote {String(uid)}</span>
        </div>
    );
}