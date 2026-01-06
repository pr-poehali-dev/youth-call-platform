const SIGNALING_URL = 'https://functions.poehali.dev/008c5380-f6ef-4b0b-9b2d-27f5be5a99ea';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' }
];

export interface WebRTCPeer {
  id: string;
  nickname: string;
  connection: RTCPeerConnection;
  stream?: MediaStream;
}

export class WebRTCManager {
  private peerId: string;
  private roomCode: string;
  private nickname: string;
  private localStream: MediaStream | null = null;
  private peers: Map<string, WebRTCPeer> = new Map();
  private pollingInterval: number | null = null;
  private onPeerStreamCallback?: (peerId: string, stream: MediaStream) => void;
  private onPeerLeftCallback?: (peerId: string) => void;

  constructor(roomCode: string, nickname: string) {
    this.peerId = this.generatePeerId();
    this.roomCode = roomCode;
    this.nickname = nickname;
  }

  private generatePeerId(): string {
    return `peer_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  async initialize(stream: MediaStream) {
    this.localStream = stream;
    
    const response = await fetch(SIGNALING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'join',
        roomCode: this.roomCode,
        peerId: this.peerId,
        nickname: this.nickname
      })
    });

    const data = await response.json();
    
    if (data.peers && data.peers.length > 0) {
      for (const peer of data.peers) {
        await this.createPeerConnection(peer.id, peer.nickname, true);
      }
    }

    this.startPolling();
  }

  private async createPeerConnection(peerId: string, nickname: string, createOffer: boolean) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream!);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendIceCandidate(peerId, event.candidate);
      }
    };

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      const peer = this.peers.get(peerId);
      if (peer) {
        peer.stream = remoteStream;
        if (this.onPeerStreamCallback) {
          this.onPeerStreamCallback(peerId, remoteStream);
        }
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.removePeer(peerId);
      }
    };

    this.peers.set(peerId, { id: peerId, nickname, connection: pc });

    if (createOffer) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await this.sendOffer(peerId, offer);
    }
  }

  private async sendOffer(targetPeer: string, offer: RTCSessionDescriptionInit) {
    await fetch(SIGNALING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'offer',
        roomCode: this.roomCode,
        peerId: this.peerId,
        targetPeer,
        offer
      })
    });
  }

  private async sendAnswer(targetPeer: string, answer: RTCSessionDescriptionInit) {
    await fetch(SIGNALING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'answer',
        roomCode: this.roomCode,
        peerId: this.peerId,
        targetPeer,
        answer
      })
    });
  }

  private async sendIceCandidate(targetPeer: string, candidate: RTCIceCandidate) {
    await fetch(SIGNALING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'ice',
        roomCode: this.roomCode,
        peerId: this.peerId,
        targetPeer,
        candidate: candidate.toJSON()
      })
    });
  }

  private startPolling() {
    this.pollingInterval = window.setInterval(async () => {
      try {
        const response = await fetch(SIGNALING_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'poll',
            roomCode: this.roomCode,
            peerId: this.peerId
          })
        });

        const data = await response.json();

        if (data.offers) {
          for (const [fromPeer, offer] of Object.entries(data.offers)) {
            await this.handleOffer(fromPeer, offer as RTCSessionDescriptionInit);
          }
        }

        if (data.answers) {
          for (const [fromPeer, answer] of Object.entries(data.answers)) {
            await this.handleAnswer(fromPeer, answer as RTCSessionDescriptionInit);
          }
        }

        if (data.iceCandidates) {
          for (const [fromPeer, candidates] of Object.entries(data.iceCandidates)) {
            for (const candidate of candidates as RTCIceCandidateInit[]) {
              await this.handleIceCandidate(fromPeer, candidate);
            }
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 1000);
  }

  private async handleOffer(fromPeer: string, offer: RTCSessionDescriptionInit) {
    if (!this.peers.has(fromPeer)) {
      await this.createPeerConnection(fromPeer, 'Participant', false);
    }

    const peer = this.peers.get(fromPeer);
    if (peer) {
      await peer.connection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peer.connection.createAnswer();
      await peer.connection.setLocalDescription(answer);
      await this.sendAnswer(fromPeer, answer);
    }
  }

  private async handleAnswer(fromPeer: string, answer: RTCSessionDescriptionInit) {
    const peer = this.peers.get(fromPeer);
    if (peer && peer.connection.signalingState !== 'stable') {
      await peer.connection.setRemoteDescription(new RTCSessionDescription(answer));
    }
  }

  private async handleIceCandidate(fromPeer: string, candidate: RTCIceCandidateInit) {
    const peer = this.peers.get(fromPeer);
    if (peer && peer.connection.remoteDescription) {
      await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  private removePeer(peerId: string) {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.connection.close();
      this.peers.delete(peerId);
      if (this.onPeerLeftCallback) {
        this.onPeerLeftCallback(peerId);
      }
    }
  }

  onPeerStream(callback: (peerId: string, stream: MediaStream) => void) {
    this.onPeerStreamCallback = callback;
  }

  onPeerLeft(callback: (peerId: string) => void) {
    this.onPeerLeftCallback = callback;
  }

  getPeers(): WebRTCPeer[] {
    return Array.from(this.peers.values());
  }

  toggleAudio(enabled: boolean) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }

  async destroy() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    for (const peer of this.peers.values()) {
      peer.connection.close();
    }
    this.peers.clear();

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
    }

    await fetch(SIGNALING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'leave',
        roomCode: this.roomCode,
        peerId: this.peerId
      })
    });
  }
}
