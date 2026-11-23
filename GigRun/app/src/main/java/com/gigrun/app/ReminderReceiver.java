package com.gigrun.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Shows the follow-up notification when a reminder alarm fires. */
public class ReminderReceiver extends BroadcastReceiver {

    private static final String CHANNEL = "followups";

    @Override
    public void onReceive(Context context, Intent intent) {
        String id = intent.getStringExtra("id");
        String title = intent.getStringExtra("title");
        String text = intent.getStringExtra("text");
        if (id == null) return;

        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Follow-up reminders", NotificationManager.IMPORTANCE_HIGH));

        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent tap = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification n = new Notification.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat)
                .setContentTitle(title == null ? "GigRun follow-up" : title)
                .setContentText(text == null ? "" : text)
                .setContentIntent(tap)
                .setAutoCancel(true)
                .build();
        nm.notify(id.hashCode(), n);
        Reminders.fired(context, id);
    }
}
