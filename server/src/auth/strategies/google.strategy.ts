import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      clientID: configService.get('GOOGLE_CLIENT_ID', ''),
      clientSecret: configService.get('GOOGLE_CLIENT_SECRET', ''),
      callbackURL: configService.get('GOOGLE_CALLBACK_URL', 'http://localhost:3000/auth/google/callback'),
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: (error: any, user?: any, options?: any) => void,
  ): Promise<any> {
    try {
      const { name, emails, photos } = profile;
      const user = await this.authService.validateOAuthLogin(
        'google',
        {
          providerId: profile.id,
          email: emails?.[0]?.value,
          firstName: name?.givenName,
          lastName: name?.familyName,
          avatarUrl: photos?.[0]?.value,
        },
      );
      done(null, user);
    } catch (error) {
      done(error, false);
    }
  }
}
