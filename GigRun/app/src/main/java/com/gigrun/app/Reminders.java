package com.gigrun.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Map;

/** Follow-up reminders: stored in SharedPreferences so they survive a reboot, fired by AlarmManager. */
final class Reminders {

    private static final String PREFS = "gigrun_reminders";

    private Reminders() {}

    static void schedule(Context c, String id, long when, String title, String text) {
        try {
            JSONObject o = new JSONObject();
            o.put("when", when);
            o.put("title", title);
            o.put("text", text);
            prefs(c).edit().putString(id, o.toString()).apply();
        } catch (JSONException ignored) {
            return;
        }
        arm(c, id, when, title, text);
    }

    static void cancel(Context c, String id) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        am.cancel(pending(c, id, "", ""));
        prefs(c).edit().remove(id).apply();
    }

    static void fired(Context c, String id) {
        prefs(c).edit().remove(id).apply();
    }

    /** Called after a reboot: alarms are lost, so arm everything again. Overdue ones fire within seconds. */
    static void rescheduleAll(Context c) {
        for (Map.Entry<String, ?> e : prefs(c).getAll().entrySet()) {
            try {
                JSONObject o = new JSONObject(String.valueOf(e.getValue()));
                arm(c, e.getKey(), o.getLong("when"), o.getString("title"), o.getString("text"));
            } catch (JSONException ignored) {
                // skip a damaged entry
            }
        }
    }

    private static void arm(Context c, String id, long when, String title, String text) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        long at = Math.max(when, System.currentTimeMillis() + 5000);
        // Not an exact alarm: no special permission needed, and a follow-up reminder does not need to-the-second timing.
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending(c, id, title, text));
    }

    private static PendingIntent pending(Context c, String id, String title, String text) {
        Intent i = new Intent(c, ReminderReceiver.class);
        i.setData(Uri.parse("gigrun://reminder/" + Uri.encode(id)));
        i.putExtra("id", id);
        i.putExtra("title", title);
        i.putExtra("text", text);
        return PendingIntent.getBroadcast(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
