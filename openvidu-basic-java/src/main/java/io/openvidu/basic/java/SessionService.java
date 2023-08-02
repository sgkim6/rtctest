package io.openvidu.basic.java;

import io.openvidu.java.client.ConnectionProperties;
import io.openvidu.java.client.ConnectionProperties.Builder;
import io.openvidu.java.client.ConnectionType;
import io.openvidu.java.client.OpenVidu;
import io.openvidu.java.client.Session;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;

@org.springframework.stereotype.Service
public class SessionService {

    private OpenVidu openVidu;

    private String OPENVIDU_URL;

    private Map<String, Session> sessionMap;

    private String SECRET;

    private int roomNum = 1;
    private String token;

    public void init(){
        this.sessionMap = new ConcurrentHashMap<>();
    }

    public SessionService(@Value("${openvidu.secret}") String secret, @Value("${openvidu.url}") String url){
        this.SECRET = secret;
        this.OPENVIDU_URL = url;
        System.out.println("secret = " + secret);
        System.out.println("url = " + url);
        this.openVidu = new OpenVidu(OPENVIDU_URL, SECRET);
    }

    public NewSessionInfo openSession (String nickname, SessionOpenRequestDto requestDto) throws Exception{
        String id = "asd";
        Session session = this.openVidu.createSession();
        ConnectionProperties connectionProperties = new Builder().type(ConnectionType.WEBRTC).build();
        token = session.createConnection(connectionProperties).getToken();
        this.sessionMap.put(id,session);

        return NewSessionInfo.from(token, id);
    }


}
