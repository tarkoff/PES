import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-facebook';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      clientID: configService.get('FACEBOOK_APP_ID', ''),
      clientSecret: configService.get('FACEBOOK_APP_SECRET', ''),
      callbackURL: configService.get('FACEBOOK_CALLBACK_URL', 'http://localhost:3000/auth/facebook/callback'),
      profileFields: ['emails', 'name', 'picture'],
      scope: ['email'],
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
        'facebook',
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
