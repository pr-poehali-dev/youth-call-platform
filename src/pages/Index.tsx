import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Icon from '@/components/ui/icon';
import { useToast } from '@/hooks/use-toast';
import { WebRTCManager } from '@/lib/webrtc';

type Screen = 'auth' | 'hub' | 'call' | 'analytics';

interface CallData {
  id: string;
  code: string;
  participants: string[];
  startTime: Date;
  duration: number;
}

const Index = () => {
  const [screen, setScreen] = useState<Screen>('auth');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [micPermission, setMicPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [messages, setMessages] = useState<{user: string, text: string}[]>([]);
  const [currentCall, setCurrentCall] = useState<CallData | null>(null);
  const webrtcManager = useRef<WebRTCManager | null>(null);
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const { toast } = useToast();

  const generateCallCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const handleQuickLogin = () => {
    if (!nickname.trim()) {
      toast({ title: 'Укажите никнейм', variant: 'destructive' });
      return;
    }
    setScreen('hub');
    toast({ title: `Привет, ${nickname}! 👋` });
  };

  const handleRegister = () => {
    if (!nickname.trim() || !email.trim() || !password.trim()) {
      toast({ title: 'Заполните все поля', variant: 'destructive' });
      return;
    }
    setScreen('hub');
    toast({ title: `Аккаунт создан! Добро пожаловать, ${nickname}! 🎉` });
  };

  const handleCreateCall = async () => {
    const code = generateCallCode();
    const call: CallData = {
      id: Math.random().toString(),
      code,
      participants: [nickname],
      startTime: new Date(),
      duration: 0
    };
    setCurrentCall(call);
    setScreen('call');
    await requestMicrophoneAccess();
    toast({ title: `Комната создана! Код: ${code}`, description: 'Поделитесь кодом с участниками' });
  };

  const handleJoinCall = async () => {
    if (!joinCode.trim()) {
      toast({ title: 'Введите код комнаты', variant: 'destructive' });
      return;
    }
    const call: CallData = {
      id: Math.random().toString(),
      code: joinCode.toUpperCase(),
      participants: [nickname],
      startTime: new Date(),
      duration: 0
    };
    setCurrentCall(call);
    setScreen('call');
    await requestMicrophoneAccess();
    toast({ title: `Подключено к комнате ${joinCode.toUpperCase()}` });
  };

  const handleSendMessage = () => {
    if (!chatMessage.trim()) return;
    setMessages([...messages, { user: nickname, text: chatMessage }]);
    setChatMessage('');
  };

  const addReaction = (emoji: string) => {
    toast({ title: `${nickname} отправил ${emoji}` });
  };

  const requestMicrophoneAccess = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMediaStream(stream);
      setMicPermission('granted');
      setMicOn(true);
      
      if (currentCall && !webrtcManager.current) {
        const manager = new WebRTCManager(currentCall.code, nickname);
        await manager.initialize(stream);
        
        manager.onPeerStream((peerId, remoteStream) => {
          const audio = new Audio();
          audio.srcObject = remoteStream;
          audio.autoplay = true;
          audioRefs.current.set(peerId, audio);
          
          setCurrentCall(prev => {
            if (!prev) return prev;
            const peerNickname = `Участник #${audioRefs.current.size}`;
            if (!prev.participants.includes(peerNickname)) {
              return {
                ...prev,
                participants: [...prev.participants, peerNickname]
              };
            }
            return prev;
          });
        });
        
        manager.onPeerLeft((peerId) => {
          const audio = audioRefs.current.get(peerId);
          if (audio) {
            audio.pause();
            audio.srcObject = null;
            audioRefs.current.delete(peerId);
          }
        });
        
        webrtcManager.current = manager;
      }
      
      toast({ title: '🎤 Микрофон подключён' });
    } catch (error) {
      setMicPermission('denied');
      setMicOn(false);
      toast({ 
        title: '❌ Доступ к микрофону запрещён', 
        description: 'Разрешите доступ в настройках браузера',
        variant: 'destructive' 
      });
    }
  };

  const toggleMicrophone = async () => {
    if (!mediaStream && !micOn) {
      await requestMicrophoneAccess();
      return;
    }

    if (mediaStream) {
      const audioTracks = mediaStream.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      const newMicState = !micOn;
      setMicOn(newMicState);
      
      if (webrtcManager.current) {
        webrtcManager.current.toggleAudio(newMicState);
      }
      
      toast({ title: micOn ? '🔇 Микрофон выключен' : '🎤 Микрофон включён' });
    }
  };
  
  useEffect(() => {
    return () => {
      if (webrtcManager.current) {
        webrtcManager.current.destroy();
      }
      audioRefs.current.forEach(audio => {
        audio.pause();
        audio.srcObject = null;
      });
      audioRefs.current.clear();
    };
  }, []);

  const AuthScreen = () => (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-secondary/20" />
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiM4QjVDRjYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDE2YzAtMS4xLjktMiAyLTJoNGMxLjEgMCAyIC45IDIgMnY0YzAgMS4xLS45IDItMiAyaC00Yy0xLjEgMC0yLS45LTItMnYtNHoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-50" />
      
      <Card className="w-full max-w-md p-8 animate-scale-in relative z-10 bg-card/95 backdrop-blur-sm border-2 border-primary/20">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl gradient-primary mb-4">
            <Icon name="Video" size={32} className="text-white" />
          </div>
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            VoiceHub
          </h1>
          <p className="text-muted-foreground">Командные звонки без границ</p>
        </div>

        {!isRegistering ? (
          <div className="space-y-4 animate-fade-in">
            <div>
              <label className="text-sm font-medium mb-2 block">Никнейм</label>
              <Input 
                placeholder="Как вас называть?"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="h-12"
              />
            </div>

            <Button 
              onClick={handleQuickLogin}
              className="w-full h-12 gradient-primary hover:opacity-90 transition-opacity"
            >
              <Icon name="Zap" className="mr-2" size={20} />
              Продолжить без регистрации
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">или</span>
              </div>
            </div>

            <Button 
              onClick={() => setIsRegistering(true)}
              variant="outline"
              className="w-full h-12 hover-scale"
            >
              <Icon name="UserPlus" className="mr-2" size={20} />
              Зарегистрироваться
            </Button>
          </div>
        ) : (
          <div className="space-y-4 animate-fade-in">
            <div>
              <label className="text-sm font-medium mb-2 block">Никнейм</label>
              <Input 
                placeholder="Ваш никнейм"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="h-12"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Email</label>
              <Input 
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Пароль</label>
              <Input 
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12"
              />
            </div>

            <Button 
              onClick={handleRegister}
              className="w-full h-12 gradient-primary hover:opacity-90 transition-opacity"
            >
              Создать аккаунт
            </Button>

            <Button 
              onClick={() => setIsRegistering(false)}
              variant="ghost"
              className="w-full"
            >
              ← Назад
            </Button>
          </div>
        )}
      </Card>
    </div>
  );

  const HubScreen = () => (
    <div className="min-h-screen p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/10" />
      
      <div className="max-w-6xl mx-auto relative z-10">
        <div className="flex justify-between items-center mb-8 pt-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
              <Icon name="Video" size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">VoiceHub</h1>
              <p className="text-sm text-muted-foreground">Привет, {nickname}!</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setScreen('analytics')} className="hover-scale">
              <Icon name="BarChart3" className="mr-2" size={18} />
              Аналитика
            </Button>
            <Button variant="ghost" onClick={() => setScreen('auth')}>
              <Icon name="LogOut" size={18} />
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 animate-fade-in">
          <Card className="p-8 hover-scale cursor-pointer border-2 border-primary/40 bg-gradient-to-br from-primary/5 to-transparent backdrop-blur-sm" onClick={handleCreateCall}>
            <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mb-4">
              <Icon name="Plus" size={32} className="text-white" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Создать звонок</h2>
            <p className="text-muted-foreground mb-4">Начните новую конференцию и получите уникальный код для участников</p>
            <div className="flex items-center gap-2 text-sm text-primary">
              <Icon name="Sparkles" size={16} />
              <span>Мгновенный запуск</span>
            </div>
          </Card>

          <Card className="p-8 border-2 border-accent/40 bg-gradient-to-br from-accent/5 to-transparent backdrop-blur-sm">
            <div className="w-16 h-16 rounded-2xl gradient-accent flex items-center justify-center mb-4">
              <Icon name="Link" size={32} className="text-white" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Подключиться к звонку</h2>
            <p className="text-muted-foreground mb-4">Введите код комнаты от организатора</p>
            <div className="flex gap-2">
              <Input 
                placeholder="Введите код"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="h-12 font-mono text-lg"
                maxLength={6}
              />
              <Button onClick={handleJoinCall} className="h-12 px-6 gradient-accent hover:opacity-90">
                <Icon name="ArrowRight" size={20} />
              </Button>
            </div>
          </Card>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-6 bg-card/80 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <Icon name="Users" size={20} className="text-primary" />
              </div>
              <div>
                <div className="text-2xl font-bold">247</div>
                <div className="text-xs text-muted-foreground">Активных пользователей</div>
              </div>
            </div>
          </Card>
          
          <Card className="p-6 bg-card/80 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-secondary/20 flex items-center justify-center">
                <Icon name="Phone" size={20} className="text-secondary" />
              </div>
              <div>
                <div className="text-2xl font-bold">43</div>
                <div className="text-xs text-muted-foreground">Активных звонков</div>
              </div>
            </div>
          </Card>
          
          <Card className="p-6 bg-card/80 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
                <Icon name="Clock" size={20} className="text-accent" />
              </div>
              <div>
                <div className="text-2xl font-bold">12.4к</div>
                <div className="text-xs text-muted-foreground">Минут сегодня</div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );

  const CallScreen = () => {
    if (!currentCall) return null;

    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-secondary/5 p-4">
        <div className="max-w-7xl mx-auto h-screen flex flex-col">
          <div className="flex justify-between items-center py-4 mb-4">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="px-4 py-2 text-lg font-mono border-primary bg-primary/10">
                {currentCall.code}
              </Badge>
              <Badge className="px-3 py-1 bg-green-500/20 text-green-400 border-green-500/30">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse-glow mr-2" />
                В эфире
              </Badge>
            </div>
            <Button variant="destructive" onClick={() => setScreen('hub')} className="hover-scale">
              <Icon name="PhoneOff" className="mr-2" size={18} />
              Выйти из звонка
            </Button>
          </div>

          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="md:col-span-2">
              <Card className="h-full p-6 relative overflow-hidden border-2 border-primary/30 bg-gradient-to-br from-card to-primary/5">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center space-y-4 animate-fade-in">
                    <div className="flex justify-center gap-4 flex-wrap">
                      {currentCall.participants.map((p, i) => (
                        <div key={i} className="flex flex-col items-center gap-2 animate-scale-in">
                          <div className="w-24 h-24 rounded-2xl gradient-primary flex items-center justify-center relative">
                            <Icon name="User" size={40} className="text-white" />
                            {micOn && (
                              <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center border-2 border-background">
                                <Icon name="Mic" size={14} className="text-white" />
                              </div>
                            )}
                          </div>
                          <span className="text-sm font-medium">{p}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {chatOpen && (
              <Card className="p-4 flex flex-col animate-scale-in border-2 border-accent/30 bg-card/95 backdrop-blur-sm">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Icon name="MessageCircle" size={18} />
                    Чат
                  </h3>
                  <Button variant="ghost" size="sm" onClick={() => setChatOpen(false)}>
                    <Icon name="X" size={16} />
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                  {messages.map((msg, i) => (
                    <div key={i} className="bg-muted p-3 rounded-lg animate-fade-in">
                      <div className="text-xs text-primary font-medium mb-1">{msg.user}</div>
                      <div className="text-sm">{msg.text}</div>
                    </div>
                  ))}
                </div>
                <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex gap-2">
                  <Input 
                    placeholder="Сообщение..."
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    type="text"
                    autoComplete="off"
                  />
                  <Button type="submit" size="sm" className="gradient-accent">
                    <Icon name="Send" size={16} />
                  </Button>
                </form>
              </Card>
            )}
          </div>

          <Card className="p-4 bg-card/95 backdrop-blur-sm border-2 border-primary/20">
            <div className="flex justify-center items-center gap-3 flex-wrap">
              <Button 
                size="lg"
                variant={micOn ? "default" : "destructive"}
                onClick={toggleMicrophone}
                className="w-14 h-14 rounded-full hover-scale"
              >
                <Icon name={micOn ? "Mic" : "MicOff"} size={20} />
              </Button>

              <Button 
                size="lg"
                variant="outline"
                onClick={() => setChatOpen(!chatOpen)}
                className="w-14 h-14 rounded-full hover-scale"
              >
                <Icon name="MessageCircle" size={20} />
              </Button>

              <div className="flex gap-2">
                {['👍', '👏', '❤️', '😂', '🎉'].map((emoji) => (
                  <Button 
                    key={emoji}
                    size="lg"
                    variant="outline"
                    onClick={() => addReaction(emoji)}
                    className="w-12 h-12 rounded-full hover-scale text-xl"
                  >
                    {emoji}
                  </Button>
                ))}
              </div>

              <Button 
                size="lg"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(currentCall.code);
                  toast({ title: 'Код скопирован!' });
                }}
                className="h-12 px-6 hover-scale"
              >
                <Icon name="Copy" className="mr-2" size={18} />
                Код: {currentCall.code}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  };

  const AnalyticsScreen = () => (
    <div className="min-h-screen p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-background to-primary/10" />
      
      <div className="max-w-7xl mx-auto relative z-10">
        <div className="flex justify-between items-center mb-8 pt-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Аналитика команды</h1>
            <p className="text-muted-foreground">Статистика и метрики звонков</p>
          </div>
          <Button variant="outline" onClick={() => setScreen('hub')} className="hover-scale">
            <Icon name="ArrowLeft" className="mr-2" size={18} />
            Назад
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 animate-fade-in">
          <Card className="p-6 bg-gradient-to-br from-primary/10 to-transparent border-2 border-primary/30">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
                <Icon name="Phone" size={24} className="text-white" />
              </div>
              <div>
                <div className="text-3xl font-bold">156</div>
                <div className="text-sm text-muted-foreground">Всего звонков</div>
              </div>
            </div>
            <div className="text-xs text-green-400 flex items-center gap-1">
              <Icon name="TrendingUp" size={12} />
              <span>+23% за неделю</span>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-secondary/10 to-transparent border-2 border-secondary/30">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
                <Icon name="Users" size={24} className="text-white" />
              </div>
              <div>
                <div className="text-3xl font-bold">1,247</div>
                <div className="text-sm text-muted-foreground">Участников</div>
              </div>
            </div>
            <div className="text-xs text-green-400 flex items-center gap-1">
              <Icon name="TrendingUp" size={12} />
              <span>+12% за неделю</span>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-accent/10 to-transparent border-2 border-accent/30">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl gradient-accent flex items-center justify-center">
                <Icon name="Clock" size={24} className="text-white" />
              </div>
              <div>
                <div className="text-3xl font-bold">5.2ч</div>
                <div className="text-sm text-muted-foreground">Средняя длина</div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">За последний месяц</div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-green-500/10 to-transparent border-2 border-green-500/30">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                <Icon name="Target" size={24} className="text-green-400" />
              </div>
              <div>
                <div className="text-3xl font-bold">94%</div>
                <div className="text-sm text-muted-foreground">Удовлетворённость</div>
              </div>
            </div>
            <div className="text-xs text-green-400 flex items-center gap-1">
              <Icon name="TrendingUp" size={12} />
              <span>Отлично!</span>
            </div>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-6 animate-fade-in">
          <Card className="p-6 border-2 border-primary/20 bg-card/95 backdrop-blur-sm">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Icon name="Activity" size={18} className="text-primary" />
              Активность по дням
            </h3>
            <div className="space-y-3">
              {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day, i) => {
                const value = [85, 92, 78, 95, 88, 45, 32][i];
                return (
                  <div key={day} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{day}</span>
                      <span className="text-muted-foreground">{value}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full gradient-primary rounded-full transition-all duration-500"
                        style={{ width: `${value}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-6 border-2 border-accent/20 bg-card/95 backdrop-blur-sm">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Icon name="Users" size={18} className="text-accent" />
              Топ участников
            </h3>
            <div className="space-y-4">
              {[
                { name: nickname, calls: 42, time: '18.5ч' },
                { name: 'Алексей М.', calls: 38, time: '16.2ч' },
                { name: 'Мария К.', calls: 35, time: '15.1ч' },
                { name: 'Дмитрий С.', calls: 31, time: '13.8ч' },
                { name: 'Анна В.', calls: 28, time: '12.4ч' }
              ].map((user, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                    i === 0 ? 'gradient-primary text-white' : 'bg-muted'
                  }`}>
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{user.name}</div>
                    <div className="text-xs text-muted-foreground">{user.calls} звонков • {user.time}</div>
                  </div>
                  {i === 0 && (
                    <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                      <Icon name="Crown" size={12} className="mr-1" />
                      Лидер
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card className="p-6 border-2 border-secondary/20 bg-card/95 backdrop-blur-sm animate-fade-in">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Icon name="MessageCircle" size={18} className="text-secondary" />
            Активность в чате
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">2,847</div>
              <div className="text-xs text-muted-foreground mt-1">Сообщений</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">1,523</div>
              <div className="text-xs text-muted-foreground mt-1">Реакций</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">456</div>
              <div className="text-xs text-muted-foreground mt-1">Файлов</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">98%</div>
              <div className="text-xs text-muted-foreground mt-1">Время отклика</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );

  return (
    <>
      {screen === 'auth' && <AuthScreen />}
      {screen === 'hub' && <HubScreen />}
      {screen === 'call' && <CallScreen />}
      {screen === 'analytics' && <AnalyticsScreen />}
    </>
  );
};

export default Index;