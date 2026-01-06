import json
import time

rooms = {}

def handler(event: dict, context) -> dict:
    """
    WebRTC сигнальный сервер для координации peer-to-peer соединений
    Обрабатывает обмен SDP/ICE кандидатами между участниками звонков
    """
    method = event.get('httpMethod', 'GET')
    
    if method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            },
            'body': '',
            'isBase64Encoded': False
        }
    
    if method == 'POST':
        try:
            body = json.loads(event.get('body', '{}'))
            action = body.get('action')
            room_code = body.get('roomCode')
            peer_id = body.get('peerId')
            
            if action == 'join':
                if room_code not in rooms:
                    rooms[room_code] = {
                        'peers': {},
                        'created': time.time()
                    }
                
                rooms[room_code]['peers'][peer_id] = {
                    'nickname': body.get('nickname'),
                    'joined': time.time(),
                    'offer': None,
                    'answer': None,
                    'iceCandidates': []
                }
                
                other_peers = [
                    {'id': pid, 'nickname': pdata['nickname']} 
                    for pid, pdata in rooms[room_code]['peers'].items() 
                    if pid != peer_id
                ]
                
                return {
                    'statusCode': 200,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({
                        'status': 'joined',
                        'peers': other_peers
                    }),
                    'isBase64Encoded': False
                }
            
            elif action == 'offer':
                if room_code in rooms and peer_id in rooms[room_code]['peers']:
                    target_peer = body.get('targetPeer')
                    offer = body.get('offer')
                    
                    if target_peer in rooms[room_code]['peers']:
                        if 'offers' not in rooms[room_code]['peers'][target_peer]:
                            rooms[room_code]['peers'][target_peer]['offers'] = {}
                        rooms[room_code]['peers'][target_peer]['offers'][peer_id] = offer
                    
                    return {
                        'statusCode': 200,
                        'headers': {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        },
                        'body': json.dumps({'status': 'offer_sent'}),
                        'isBase64Encoded': False
                    }
            
            elif action == 'answer':
                if room_code in rooms and peer_id in rooms[room_code]['peers']:
                    target_peer = body.get('targetPeer')
                    answer = body.get('answer')
                    
                    if target_peer in rooms[room_code]['peers']:
                        if 'answers' not in rooms[room_code]['peers'][target_peer]:
                            rooms[room_code]['peers'][target_peer]['answers'] = {}
                        rooms[room_code]['peers'][target_peer]['answers'][peer_id] = answer
                    
                    return {
                        'statusCode': 200,
                        'headers': {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        },
                        'body': json.dumps({'status': 'answer_sent'}),
                        'isBase64Encoded': False
                    }
            
            elif action == 'ice':
                if room_code in rooms and peer_id in rooms[room_code]['peers']:
                    target_peer = body.get('targetPeer')
                    candidate = body.get('candidate')
                    
                    if target_peer in rooms[room_code]['peers']:
                        if 'iceCandidates' not in rooms[room_code]['peers'][target_peer]:
                            rooms[room_code]['peers'][target_peer]['iceCandidates'] = {}
                        if peer_id not in rooms[room_code]['peers'][target_peer]['iceCandidates']:
                            rooms[room_code]['peers'][target_peer]['iceCandidates'][peer_id] = []
                        rooms[room_code]['peers'][target_peer]['iceCandidates'][peer_id].append(candidate)
                    
                    return {
                        'statusCode': 200,
                        'headers': {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        },
                        'body': json.dumps({'status': 'ice_sent'}),
                        'isBase64Encoded': False
                    }
            
            elif action == 'poll':
                if room_code in rooms and peer_id in rooms[room_code]['peers']:
                    peer_data = rooms[room_code]['peers'][peer_id]
                    
                    offers = peer_data.get('offers', {})
                    answers = peer_data.get('answers', {})
                    ice_candidates = peer_data.get('iceCandidates', {})
                    
                    peer_data['offers'] = {}
                    peer_data['answers'] = {}
                    peer_data['iceCandidates'] = {}
                    
                    return {
                        'statusCode': 200,
                        'headers': {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        },
                        'body': json.dumps({
                            'offers': offers,
                            'answers': answers,
                            'iceCandidates': ice_candidates
                        }),
                        'isBase64Encoded': False
                    }
            
            elif action == 'leave':
                if room_code in rooms and peer_id in rooms[room_code]['peers']:
                    del rooms[room_code]['peers'][peer_id]
                    
                    if len(rooms[room_code]['peers']) == 0:
                        del rooms[room_code]
                
                return {
                    'statusCode': 200,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({'status': 'left'}),
                    'isBase64Encoded': False
                }
            
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': 'Unknown action'}),
                'isBase64Encoded': False
            }
            
        except Exception as e:
            return {
                'statusCode': 500,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': str(e)}),
                'isBase64Encoded': False
            }
    
    return {
        'statusCode': 405,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        'body': json.dumps({'error': 'Method not allowed'}),
        'isBase64Encoded': False
    }
