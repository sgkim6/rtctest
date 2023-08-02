package io.openvidu.basic.java;

public class NewSessionInfo {

    String token;
    String id;

    public static NewSessionInfo from(String token, String id){
        NewSessionInfo info = new NewSessionInfo();
        info.setToken(token);
        info.setId(id);

        return info;
    }

    public String getToken() {
        return token;
    }

    public void setToken(String token) {
        this.token = token;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }
}
