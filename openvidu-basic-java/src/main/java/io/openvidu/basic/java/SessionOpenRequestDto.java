package io.openvidu.basic.java;

public class SessionOpenRequestDto {
    String title;
    boolean isPublic;
    int discussionTime;
    int maxPlayer;
    String password;

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public boolean isPublic() {
        return isPublic;
    }

    public void setPublic(boolean aPublic) {
        isPublic = aPublic;
    }

    public int getDiscussionTime() {
        return discussionTime;
    }

    public void setDiscussionTime(int discussionTime) {
        this.discussionTime = discussionTime;
    }

    public int getMaxPlayer() {
        return maxPlayer;
    }

    public void setMaxPlayer(int maxPlayer) {
        this.maxPlayer = maxPlayer;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }
}
